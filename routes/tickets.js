const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { mysqlPool } = require('../config/database');
const { createNotification } = require('../helpers/notifications');
const { createIdleTicketsForDate } = require('./idleAccountability');

const upload = multer();

// ===== Helpers =====

async function generateTicketNumber(connection) {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, '0') +
    today.getDate().toString().padStart(2, '0');
  const [countResult] = await connection.execute(
    'SELECT COUNT(*) as count FROM tickets WHERE DATE(created_at) = CURDATE()'
  );
  const count = countResult[0].count + 1;
  return { ticketNumber: `TKT-${dateStr}-${count.toString().padStart(3, '0')}`, dateStr };
}

async function createLessHoursTicketsForDate(targetDate, thresholdHours = 6, createdByUserId = null, department = null, designation = null) {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const dateStr = (targetDate || new Date().toISOString().split('T')[0]).split('T')[0];
    const minSeconds = parseFloat(thresholdHours) * 3600;
    const startDate = `${dateStr} 00:00:00`;
    const endDate = `${dateStr} 23:59:59`;

    const params = [startDate, endDate];
    let whereClause = "e.status = 'Active'";
    if (department) { whereClause += ' AND e.department = ?'; params.push(department); }
    if (designation) { whereClause += ' AND e.designation = ?'; params.push(designation); }
    params.push(minSeconds);

    const query = `
      SELECT e.id, e.name, e.employee_id, e.department, e.designation,
        COALESCE(SUM(
          CASE 
            WHEN tt.hours_logged_seconds IS NOT NULL AND tt.hours_logged_seconds != 0 THEN ABS(tt.hours_logged_seconds)
            WHEN tt.hours_logged IS NOT NULL AND tt.hours_logged != 0 THEN ABS(tt.hours_logged)
            WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN ABS(TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time))
            ELSE 0
          END
        ), 0) as total_seconds
      FROM employees e
      LEFT JOIN task_timesheet tt ON tt.employee_name = e.name AND tt.start_time >= ? AND tt.start_time <= ?
      WHERE ${whereClause}
      GROUP BY e.id, e.name, e.employee_id, e.department, e.designation
      HAVING total_seconds < ?
      ORDER BY total_seconds ASC, e.department, e.name
    `;

    const [rows] = await connection.execute(query, params);
    let ticketsCreated = 0;

    for (const row of rows) {
      const employeeId = row.id;
      const dept = row.department || null;

      const [existing] = await connection.execute(
        `SELECT id FROM tickets WHERE category = 'Less hours logged' AND assigned_to = ? AND DATE(created_at) = ? AND status IN ('Open', 'In Progress') LIMIT 1`,
        [employeeId, dateStr]
      );
      if (existing.length > 0) continue;

      const { ticketNumber } = await generateTicketNumber(connection);
      const title = 'EMS less hours.';
      const description = `This notification is to notify you that you have hours logged less than ${thresholdHours} in EMS for ${dateStr}.`;

      const [result] = await connection.execute(
        `INSERT INTO tickets (ticket_number, title, description, category, priority, status, assigned_to, department, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ticketNumber, title, description, 'Less hours logged', 'High', 'Open', employeeId, dept, createdByUserId || employeeId]
      );

      try {
        await createNotification(employeeId, result.insertId, 'new_ticket_assigned', 'New Ticket Assigned', `You have been assigned a new ticket: ${title}`);
      } catch (notifyErr) { console.warn('Failed to create less-hours ticket notification:', notifyErr); }

      ticketsCreated += 1;
    }
    return { date: dateStr, thresholdHours, ticketsCreated };
  } finally {
    if (connection) connection.release();
  }
}

async function createOverEstTicketsForRange(startDate, endDate, minOverMinutes = 10, designation = null, department = null, createdByUserId = null) {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
  } catch (e) { throw new Error('Database connection failed'); }

  try {
    const start = (startDate || new Date().toISOString().split('T')[0]).split('T')[0];
    const end = (endDate || new Date().toISOString().split('T')[0]).split('T')[0];
    const minOver = Number(minOverMinutes) >= 0 ? Number(minOverMinutes) : 10;
    const minOverSeconds = minOver * 60;

    const params = [];
    let where = `tt.start_time >= ? AND tt.start_time <= ?`;
    params.push(`${start} 00:00:00`, `${end} 23:59:59`);
    if (designation) { where += ` AND e.designation = ?`; params.push(designation); }
    if (department) { where += ` AND e.department = ?`; params.push(department); }

    const query = `
      SELECT tt.task_id, t.title AS task_title, t.labels, t.priority, t.department,
        tt.employee_name, e.id AS employee_id, e.designation, DATE(tt.start_time) AS log_date,
        MAX(COALESCE(t.time_estimate_hours, 0)) AS time_estimate_hours,
        MAX(COALESCE(t.time_estimate_minutes, 0)) AS time_estimate_minutes,
        SUM(
          CASE 
            WHEN tt.hours_logged_seconds IS NOT NULL AND tt.hours_logged_seconds != 0 THEN ABS(tt.hours_logged_seconds)
            WHEN tt.hours_logged IS NOT NULL AND tt.hours_logged != 0 THEN ABS(tt.hours_logged)
            WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN ABS(TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time))
            ELSE 0
          END
        ) AS actual_seconds
      FROM task_timesheet tt
      LEFT JOIN tasks t ON t.id = tt.task_id
      LEFT JOIN employees e ON e.name = tt.employee_name
      WHERE ${where}
      GROUP BY tt.task_id, t.title, t.labels, t.priority, tt.employee_name, e.id, e.designation, t.department, DATE(tt.start_time)
      ORDER BY log_date DESC, actual_seconds DESC
    `;

    const [rows] = await connection.execute(query, params);

    const items = rows.map(row => {
      const estHours = Number(row.time_estimate_hours) || 0;
      const estMinutes = Number(row.time_estimate_minutes) || 0;
      const estimateSeconds = (estHours > 0 || estMinutes > 0) ? (estHours * 60 + estMinutes) * 60 : 0;
      const actualSeconds = Number(row.actual_seconds) || 0;
      const overrunSeconds = Math.max(0, actualSeconds - estimateSeconds);
      return { task_id: row.task_id, task_title: row.task_title, department: row.department || null, employee_name: row.employee_name, employee_id: row.employee_id, log_date: row.log_date, estimate_seconds: estimateSeconds, actual_seconds: actualSeconds, overrun_seconds: overrunSeconds };
    }).filter(r => r.overrun_seconds >= minOverSeconds && r.estimate_seconds > 0);

    let ticketsCreated = 0;
    for (const row of items) {
      const employeeId = row.employee_id;
      if (!employeeId) continue;

      const logDateStr = row.log_date && (typeof row.log_date === 'string' ? row.log_date : row.log_date.toISOString ? row.log_date.toISOString().split('T')[0] : null) || '';
      const taskTitle = (row.task_title || `Task #${row.task_id}`).trim();
      const overrunSec = row.overrun_seconds || 0;
      const overrunH = Math.floor(overrunSec / 3600);
      const overrunM = Math.floor((overrunSec % 3600) / 60);
      const overrunLabel = overrunH > 0 ? `${overrunH}h ${overrunM}m` : `${overrunM} minutes`;
      const description = `You have logged "${overrunLabel}" extra hours or minutes for "${taskTitle}" task on date ${logDateStr}.`;

      const [existing] = await connection.execute(
        `SELECT id FROM tickets WHERE category = 'Task Overestimated' AND assigned_to = ? AND DATE(created_at) = ? AND description = ? AND status IN ('Open', 'In Progress') LIMIT 1`,
        [employeeId, logDateStr, description]
      );
      if (existing.length > 0) continue;

      const { ticketNumber } = await generateTicketNumber(connection);
      const [result] = await connection.execute(
        `INSERT INTO tickets (ticket_number, title, description, category, priority, status, assigned_to, department, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ticketNumber, 'Task overestimated', description, 'Task Overestimated', 'High', 'Open', employeeId, row.department, createdByUserId || employeeId]
      );

      try {
        await createNotification(employeeId, result.insertId, 'new_ticket_assigned', 'New Ticket Assigned', `You have been assigned a new ticket: Task overestimated`);
      } catch (notifyErr) { console.warn('Failed to create over-estimate ticket notification:', notifyErr); }
      ticketsCreated += 1;
    }
    return { startDate: start, endDate: end, minOverMinutes: minOver, ticketsCreated };
  } finally {
    if (connection) connection.release();
  }
}

// Shared SELECT for ticket with joins
const TICKET_SELECT = `
  SELECT t.id, t.ticket_number, t.title, t.description, t.category, t.priority, t.status,
    t.assigned_to, t.department, t.created_by, t.created_at, t.updated_at,
    e1.name as assigned_to_name, e2.name as created_by_name, d.name as department_name
  FROM tickets t
  LEFT JOIN employees e1 ON t.assigned_to = e1.id
  LEFT JOIN employees e2 ON t.created_by = e2.id
  LEFT JOIN departments d ON t.department = d.name
`;

// ===== ROUTES =====
// IMPORTANT: specific routes (auto-*, bulk-delete) MUST come before /:id

// GET /api/tickets - List tickets (permission-based)
router.get('/', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
    const userRole = req.headers['user-role'] || 'employee';
    const userId = req.headers['user-id'] || '';

    let query = `${TICKET_SELECT} WHERE 1=1`;
    const params = [];

    const hasViewAllTickets = userPermissions.includes('all') || userPermissions.includes('view_tickets');
    const isAdminUser = userRole === 'admin' || userRole === 'Admin';
    const hasViewOwnTickets = userPermissions.includes('view_own_tickets') || !isAdminUser;

    if (hasViewOwnTickets && !hasViewAllTickets) {
      query += ' AND (t.created_by = ? OR t.assigned_to = ?)';
      params.push(userId, userId);
    } else if (!hasViewAllTickets) {
      query += ' AND 1=0';
    }

    query += ' ORDER BY t.created_at DESC';
    const [tickets] = await connection.execute(query, params);
    res.json(tickets);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/tickets - Create ticket
router.post('/', async (req, res) => {
  const { title, description, category, priority, assigned_to, department, created_by } = req.body;
  if (!title || !category) return res.status(400).json({ error: 'Title and category are required' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const { ticketNumber } = await generateTicketNumber(connection);
    const [result] = await connection.execute(
      `INSERT INTO tickets (ticket_number, title, description, category, priority, status, assigned_to, department, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketNumber, title, description || '', category, priority || 'Medium', 'Open', assigned_to || null, department || null, created_by || null]
    );

    const [tickets] = await connection.execute(`${TICKET_SELECT} WHERE t.id = ?`, [result.insertId]);

    if (tickets.length > 0) {
      if (assigned_to) {
        await createNotification(assigned_to, tickets[0].id, 'new_ticket_assigned', 'New Ticket Assigned', `You have been assigned a new ticket: ${tickets[0].title}`);
      }
      res.status(201).json(tickets[0]);
    } else {
      res.status(201).json({ id: result.insertId, ticket_number: ticketNumber, message: 'Ticket created successfully' });
    }
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/tickets/auto-less-hours
router.post('/auto-less-hours', async (req, res) => {
  const userRole = (req.headers['user-role'] || req.headers['x-user-role'] || 'employee').toString();
  const userPermissionsHeader = req.headers['user-permissions'] || req.headers['x-user-permissions'] || '[]';
  const userDesignation = (req.headers['x-user-designation'] || req.headers['user-designation'] || '').toString().trim().toLowerCase();

  let userPermissions = [];
  try { userPermissions = typeof userPermissionsHeader === 'string' ? JSON.parse(userPermissionsHeader) : []; }
  catch (e) { return res.status(400).json({ error: 'Invalid permissions format' }); }

  const isManagerByRole = userRole === 'admin' || userRole === 'Admin' || userRole === 'manager' || userRole === 'Manager';
  const isManagerByDesignation = userDesignation !== '' && userDesignation.includes('manager');
  const canRun = isManagerByRole || isManagerByDesignation || userPermissions.includes('all') || userPermissions.includes('tickets_auto_less_hours');
  if (!canRun) return res.status(403).json({ error: 'Access denied: You do not have permission to auto-create less-hours tickets' });

  const body = req.body || {};
  const targetDate = (body.date || req.query.date || new Date().toISOString().split('T')[0]).split('T')[0];
  const thresholdHours = Number(body.minHours || req.query.minHours || 6) || 6;
  const department = body.department || req.query.department || null;
  const designation = body.designation || req.query.designation || null;
  const createdBy = req.headers['user-id'] || req.headers['x-user-id'] || null;

  try {
    const result = await createLessHoursTicketsForDate(targetDate, thresholdHours, createdBy, department, designation);
    res.json(result);
  } catch (err) {
    console.error('Error auto-creating less-hours tickets:', err);
    res.status(500).json({ error: 'Failed to auto-create less-hours tickets' });
  }
});

// POST /api/tickets/auto-over-estimate
router.post('/auto-over-estimate', async (req, res) => {
  const userRole = (req.headers['user-role'] || req.headers['x-user-role'] || 'employee').toString();
  const userPermissionsHeader = req.headers['user-permissions'] || req.headers['x-user-permissions'] || '[]';
  const userDesignation = (req.headers['x-user-designation'] || req.headers['user-designation'] || '').toString().trim().toLowerCase();

  let userPermissions = [];
  try { userPermissions = typeof userPermissionsHeader === 'string' ? JSON.parse(userPermissionsHeader) : []; }
  catch (e) { return res.status(400).json({ error: 'Invalid permissions format' }); }

  const isManagerByRole = userRole === 'admin' || userRole === 'Admin' || userRole === 'manager' || userRole === 'Manager';
  const isManagerByDesignation = userDesignation !== '' && userDesignation.includes('manager');
  const canRun = isManagerByRole || isManagerByDesignation || userPermissions.includes('all') || userPermissions.includes('tickets_auto_less_hours');
  if (!canRun) return res.status(403).json({ error: 'Access denied: You do not have permission to auto-create over-estimate tickets' });

  const body = req.body || {};
  const startDate = (body.startDate || req.query.startDate || new Date().toISOString().split('T')[0]).split('T')[0];
  const endDate = (body.endDate || req.query.endDate || new Date().toISOString().split('T')[0]).split('T')[0];
  const minOverMinutes = Number(body.minOverMinutes ?? req.query.minOverMinutes ?? 10) || 10;
  const designation = body.designation || req.query.designation || null;
  const department = body.department || req.query.department || null;
  const createdBy = req.headers['user-id'] || req.headers['x-user-id'] || null;

  try {
    const result = await createOverEstTicketsForRange(startDate, endDate, minOverMinutes, designation, department, createdBy);
    res.json(result);
  } catch (err) {
    console.error('Error auto-creating over-estimate tickets:', err);
    res.status(500).json({ error: 'Failed to auto-create over-estimate tickets' });
  }
});

// POST /api/tickets/auto-idle-accountability
router.post('/auto-idle-accountability', async (req, res) => {
  const userRole = (req.headers['user-role'] || req.headers['x-user-role'] || 'employee').toString();
  const permsHeader = req.headers['user-permissions'] || req.headers['x-user-permissions'] || '[]';
  let perms = [];
  try { perms = typeof permsHeader === 'string' ? JSON.parse(permsHeader) : []; }
  catch { return res.status(400).json({ error: 'Invalid permissions format' }); }

  const isAdmin = userRole === 'admin' || userRole === 'Admin' || perms.includes('all') || perms.includes('tickets_auto_less_hours');
  if (!isAdmin) return res.status(403).json({ error: 'Access denied: You do not have permission to auto-create idle tickets' });

  const body = req.body || {};
  const creatorIdHeader = req.headers['user-id'] || req.headers['x-user-id'];
  const createdBy = (typeof creatorIdHeader === 'string' && creatorIdHeader.trim() ? Number(creatorIdHeader) : null) || null;
  const targetDate = (body.date || req.query.date || new Date().toISOString().split('T')[0]).split('T')[0];
  const department = body.department || req.query.department || null;
  const designation = body.designation || req.query.designation || null;
  const customTitle = body.title || null;
  const customDescription = body.description || null;

  try {
    const result = await createIdleTicketsForDate(targetDate, { department, designation, title: customTitle, description: customDescription, createdBy });
    res.json(result);
  } catch (err) {
    console.error('Error auto-creating idle accountability tickets:', err);
    res.status(500).json({ error: 'Failed to auto-create idle accountability tickets' });
  }
});

// POST /api/tickets/bulk-delete
router.post('/bulk-delete', async (req, res) => {
  const userPermissions = req.headers['user-permissions'] ? (typeof req.headers['user-permissions'] === 'string' ? JSON.parse(req.headers['user-permissions']) : req.headers['user-permissions']) : [];
  const canDelete = userPermissions.includes('all') || userPermissions.includes('delete_tickets');
  if (!canDelete) return res.status(403).json({ error: 'Access denied. You need delete_tickets permission.' });

  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Request body must include an array of ticket ids' });

  const ticketIds = ids.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0).map((id) => Number(id));
  if (ticketIds.length === 0) return res.status(400).json({ error: 'No valid ticket ids provided' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const placeholders = ticketIds.map(() => '?').join(',');
    await connection.execute(`DELETE FROM ticket_replies WHERE ticket_id IN (${placeholders})`, ticketIds);
    const [result] = await connection.execute(`DELETE FROM tickets WHERE id IN (${placeholders})`, ticketIds);
    res.json({ message: 'Tickets deleted', deleted: result.affectedRows || 0 });
  } catch (err) {
    console.error('Error bulk-deleting tickets:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/tickets/:id
router.get('/:id', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [tickets] = await connection.execute(`${TICKET_SELECT} WHERE t.id = ?`, [req.params.id]);
    if (tickets.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json(tickets[0]);
  } catch (err) {
    console.error('Error fetching ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/tickets/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, category, priority, status, assigned_to, department } = req.body;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [existing] = await connection.execute('SELECT id FROM tickets WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Ticket not found' });

    await connection.execute(
      `UPDATE tickets SET title = ?, description = ?, category = ?, priority = ?, status = ?, assigned_to = ?, department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [title, description, category, priority, status, assigned_to, department, id]
    );

    const [tickets] = await connection.execute(`${TICKET_SELECT} WHERE t.id = ?`, [id]);
    res.json(tickets.length > 0 ? tickets[0] : { message: 'Ticket updated successfully' });
  } catch (err) {
    console.error('Error updating ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/tickets/:id
router.delete('/:id', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute('DELETE FROM tickets WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/tickets/:id/mark-unread
router.put('/:id/mark-unread', async (req, res) => {
  const { id } = req.params;
  const { user_ids } = req.body;
  if (!user_ids || !Array.isArray(user_ids)) return res.status(400).json({ error: 'user_ids array is required' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    for (const user_id of user_ids) {
      await connection.execute('UPDATE ticket_notifications SET is_read = false, read_at = NULL WHERE user_id = ? AND ticket_id = ?', [user_id, id]);
    }
    res.json({ message: 'Ticket marked as unread for specified users' });
  } catch (err) {
    console.error('Error marking ticket as unread:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/tickets/:id/replies
router.get('/:id/replies', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [replies] = await connection.execute(
      `SELECT tr.id, tr.ticket_id, tr.replied_by, tr.replied_by_name, tr.reply_text, tr.reply_type, tr.is_internal, tr.created_at, tr.updated_at
       FROM ticket_replies tr WHERE tr.ticket_id = ? ORDER BY tr.created_at ASC`,
      [req.params.id]
    );
    res.json(replies);
  } catch (err) {
    console.error('Error fetching ticket replies:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/tickets/:id/replies (with file upload)
router.post('/:id/replies', upload.any(), async (req, res) => {
  const { id } = req.params;
  const { reply_text, reply_type, is_internal, replied_by, replied_by_name } = req.body;
  if (!reply_text || !replied_by || !replied_by_name) {
    return res.status(400).json({ error: 'Reply text, replied_by, and replied_by_name are required' });
  }

  const isInternal = (is_internal === true || is_internal === 'true' || String(is_internal).toLowerCase() === 'true') ? 1 : 0;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [ticketExists] = await connection.execute('SELECT id FROM tickets WHERE id = ?', [id]);
    if (ticketExists.length === 0) return res.status(404).json({ error: 'Ticket not found' });

    const [result] = await connection.execute(
      `INSERT INTO ticket_replies (ticket_id, replied_by, replied_by_name, reply_text, reply_type, is_internal) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, replied_by, replied_by_name, reply_text, reply_type || 'customer_reply', isInternal]
    );

    const [replies] = await connection.execute(
      `SELECT tr.id, tr.ticket_id, tr.replied_by, tr.replied_by_name, tr.reply_text, tr.reply_type, tr.is_internal, tr.created_at, tr.updated_at FROM ticket_replies tr WHERE tr.id = ?`,
      [result.insertId]
    );

    if (replies.length > 0) {
      const newReply = replies[0];

      // Handle file uploads
      if (req.files && req.files.length > 0) {
        const uploadsDir = path.join(__dirname, '..', 'uploads', 'ticket-attachments');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        const attachmentPaths = [];
        for (const file of req.files) {
          const fileExtension = path.extname(file.originalname);
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
          const filePath = path.join(uploadsDir, fileName);
          fs.writeFileSync(filePath, file.buffer);
          attachmentPaths.push({ originalName: file.originalname, fileName, filePath, size: file.size, mimeType: file.mimetype });
        }

        await connection.execute(
          'UPDATE ticket_replies SET reply_text = CONCAT(reply_text, ?) WHERE id = ?',
          [`\n\n[Attachments: ${attachmentPaths.map(a => a.originalName).join(', ')}]`, result.insertId]
        );
      }

      // Notifications for ticket creator and assigned user
      const [ticketDetails] = await connection.execute('SELECT * FROM tickets WHERE id = ?', [id]);
      if (ticketDetails.length > 0) {
        const ticket = ticketDetails[0];
        const usersToMarkUnread = [];

        if (ticket.created_by && ticket.created_by !== replied_by) {
          await createNotification(ticket.created_by, ticket.id, 'new_reply', 'New Reply', `New reply added to ticket: ${ticket.title}`);
          usersToMarkUnread.push(ticket.created_by);
        }
        if (ticket.assigned_to && ticket.assigned_to !== replied_by && ticket.assigned_to !== ticket.created_by) {
          await createNotification(ticket.assigned_to, ticket.id, 'new_reply', 'New Reply', `New reply added to ticket: ${ticket.title}`);
          usersToMarkUnread.push(ticket.assigned_to);
        }

        for (const user_id of usersToMarkUnread) {
          try {
            await connection.execute('UPDATE ticket_notifications SET is_read = false, read_at = NULL WHERE user_id = ? AND ticket_id = ?', [user_id, id]);
          } catch (err) { console.error('Error marking ticket as unread:', err); }
        }
      }

      res.status(201).json(newReply);
    } else {
      res.status(201).json({ id: result.insertId, message: 'Reply added successfully' });
    }
  } catch (err) {
    console.error('Error adding ticket reply:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/tickets/:ticketId/replies/:replyId
router.put('/:ticketId/replies/:replyId', async (req, res) => {
  const { ticketId, replyId } = req.params;
  const { reply_text, reply_type, is_internal } = req.body;
  const isInternal = (is_internal === true || is_internal === 'true' || String(is_internal).toLowerCase() === 'true') ? 1 : 0;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [existing] = await connection.execute('SELECT id FROM ticket_replies WHERE id = ? AND ticket_id = ?', [replyId, ticketId]);
    if (existing.length === 0) return res.status(404).json({ error: 'Reply not found' });

    await connection.execute(
      `UPDATE ticket_replies SET reply_text = ?, reply_type = ?, is_internal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ticket_id = ?`,
      [reply_text, reply_type, isInternal, replyId, ticketId]
    );

    const [replies] = await connection.execute(
      `SELECT tr.id, tr.ticket_id, tr.replied_by, tr.replied_by_name, tr.reply_text, tr.reply_type, tr.is_internal, tr.created_at, tr.updated_at FROM ticket_replies tr WHERE tr.id = ?`,
      [replyId]
    );
    res.json(replies.length > 0 ? replies[0] : { message: 'Reply updated successfully' });
  } catch (err) {
    console.error('Error updating ticket reply:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/tickets/:ticketId/replies/:replyId
router.delete('/:ticketId/replies/:replyId', async (req, res) => {
  const { ticketId, replyId } = req.params;
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute('DELETE FROM ticket_replies WHERE id = ? AND ticket_id = ?', [replyId, ticketId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reply not found' });
    res.json({ message: 'Reply deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket reply:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
module.exports.createLessHoursTicketsForDate = createLessHoursTicketsForDate;
module.exports.createOverEstTicketsForRange = createOverEstTicketsForRange;
