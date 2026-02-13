// NOTIFICATIONS ROUTES - Extract from server-backup.js lines: 2494-2627 + 8079-9090
// Mount at: /api/notifications
const router = require('express').Router();
const axios = require('axios');
const { mysqlPool } = require('../config/database');
const { createNotification } = require('../helpers/notifications');
const { getEpochMsForRange, getIdleHours } = require('../helpers/dates');

const TEAMLOGGER_EMPLOYEE_SUMMARY_REPORT_URL = 'https://api2.teamlogger.com/api/employee_summary_report';
// TODO: Copy handlers
// DWM Incomplete Tasks Notifications API
router.get('/dwm-incomplete', async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'date parameter is required (YYYY-MM-DD)' });
  }

  // Check if user has dwm_view permission
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  // Check if user has dwm_view permission or is admin
  if (!permissions.includes('dwm_view') && !permissions.includes('all') && userRole !== 'admin') {
    console.log(`Access denied: User role ${userRole} attempted to access DWM notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view DWM notifications.',
      requiredPermission: 'dwm_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Parse the date to get day of week and day of month
    const targetDate = new Date(date + 'T00:00:00');
    const dayOfWeekNum = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    // Skip Sunday - return empty so incomplete notifications and scoring do not apply
    if (dayOfWeekNum === 0) {
      return res.json([]);
    }
    const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dayOfMonth = targetDate.getDate();

    console.log(`🔔 DWM Notifications: Checking for date ${date} (${dayOfWeek}, ${dayOfMonth} of month)`);

    // First, let's check what DWM tasks exist in the database
    const debugQuery = `
        SELECT id, title, labels, status, department, assigned_to
        FROM tasks 
        WHERE LOWER(IFNULL(labels,'')) LIKE '%daily%'
           OR LOWER(IFNULL(labels,'')) LIKE '%weekly%'
           OR LOWER(IFNULL(labels,'')) LIKE '%monthly%'
      `;

    const [debugRows] = await connection.execute(debugQuery);
    console.log('🔔 DWM Debug: Found DWM tasks in database:', debugRows);

    // Check specific task ID 148 to see its data
    const task148Query = `SELECT id, title, labels, status, department, assigned_to FROM tasks WHERE id = 148`;
    const [task148Rows] = await connection.execute(task148Query);
    console.log('🔔 DWM Debug: Task 148 data:', task148Rows);

    // Check for tasks assigned to Hamza Nadeem in procurement department
    const hamzaQuery = `SELECT id, title, labels, status, department, assigned_to FROM tasks WHERE assigned_to LIKE '%Hamza Nadeem%' AND department LIKE '%Procurement%'`;
    const [hamzaRows] = await connection.execute(hamzaQuery);
    console.log('🔔 DWM Debug: Hamza Nadeem procurement tasks:', hamzaRows);

    // Check for tasks with "apparel" in the title
    const apparelQuery = `SELECT id, title, labels, status, department, assigned_to FROM tasks WHERE LOWER(title) LIKE '%apparel%'`;
    const [apparelRows] = await connection.execute(apparelQuery);
    console.log('🔔 DWM Debug: Apparel tasks:', apparelRows);
    // Check task history for completion tracking
    const historyQuery = `SELECT task_id, action, new_value, created_at FROM task_history WHERE action = 'Status changed' AND new_value = 'Completed' AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:00')) = ? ORDER BY created_at DESC LIMIT 10`;
    const [historyRows] = await connection.execute(historyQuery, [date]);
    console.log('🔔 DWM Debug: Recent completions on', date, ':', historyRows);
    // Also check if there are any tasks with 'Daily Task' in the title
    const dailyTitleQuery = `SELECT id, title, labels, status FROM tasks WHERE LOWER(title) LIKE '%daily task%'`;
    const [dailyTitleRows] = await connection.execute(dailyTitleQuery);
    console.log('🔔 DWM Debug: Tasks with "Daily Task" in title:', dailyTitleRows);
    // Query to find incomplete DWM tasks that were ACTUALLY due on the specified date
    const query = `
        SELECT DISTINCT
          t.id,
          t.title,
          t.description,
          t.department,
          t.assigned_to,
          t.labels,
          t.priority,
          t.status,
          '${date}' as date,
          CASE 
            WHEN (
              LOWER(IFNULL(t.labels,'')) LIKE '%daily%' 
              OR LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%'
              OR LOWER(t.title) LIKE '%daily%'
              OR LOWER(t.title) LIKE '%daily task%'
            ) THEN 'Daily'
            WHEN (
              t.title LIKE '%(${dayOfWeek})%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%'
              OR LOWER(t.title) LIKE '%weekly%'
              OR LOWER(t.title) LIKE '%weekly task%'
            ) THEN 'Weekly'
            WHEN (
              LOWER(t.title) LIKE '%(${dayOfMonth} of month)%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%'
              OR LOWER(t.title) LIKE '%monthly%'
              OR LOWER(t.title) LIKE '%monthly task%'
            ) THEN 'Monthly'
            ELSE 'Unknown'
          END as task_type
        FROM tasks t
        WHERE (
          -- Daily tasks: always due (check both labels and title)
          (
            LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%'
            OR LOWER(t.title) LIKE '%daily task%'
          )
          -- Weekly tasks: only due on their specific day (check both labels and title)
          OR (
            t.title LIKE '%(${dayOfWeek})%'
            OR (
              (LOWER(IFNULL(t.labels,'')) LIKE '%weekly%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%'
              OR LOWER(t.title) LIKE '%weekly%'
              OR LOWER(t.title) LIKE '%weekly task%')
              AND (
                ('${dayOfWeek}' = 'Monday' AND (t.title LIKE '%Monday%' OR t.title LIKE '%(Monday)%'))
                OR ('${dayOfWeek}' = 'Tuesday' AND (t.title LIKE '%Tuesday%' OR t.title LIKE '%(Tuesday)%'))
                OR ('${dayOfWeek}' = 'Wednesday' AND (t.title LIKE '%Wednesday%' OR t.title LIKE '%(Wednesday)%'))
                OR ('${dayOfWeek}' = 'Thursday' AND (t.title LIKE '%Thursday%' OR t.title LIKE '%(Thursday)%'))
                OR ('${dayOfWeek}' = 'Friday' AND (t.title LIKE '%Friday%' OR t.title LIKE '%(Friday)%'))
                OR ('${dayOfWeek}' = 'Saturday' AND (t.title LIKE '%Saturday%' OR t.title LIKE '%(Saturday)%'))
                OR ('${dayOfWeek}' = 'Sunday' AND (t.title LIKE '%Sunday%' OR t.title LIKE '%(Sunday)%'))
              )
            )
          )
          -- Monthly tasks: only due on their specific date (check both labels and title)
          OR (
            LOWER(t.title) LIKE '%(${dayOfMonth} of month)%'
            OR (
              (LOWER(IFNULL(t.labels,'')) LIKE '%monthly%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
              OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%'
              OR LOWER(t.title) LIKE '%monthly%'
              OR LOWER(t.title) LIKE '%monthly task%')
              AND (
                t.title LIKE '%${dayOfMonth}%'
                OR t.title LIKE '%(${dayOfMonth} of month)%'
              )
            )
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM task_history th 
          WHERE th.task_id = t.id 
          AND th.action = 'Status changed' 
          AND th.new_value = 'Completed' 
          AND DATE(CONVERT_TZ(th.created_at, '+00:00', '+05:00')) = ?
        )
        -- Additional check: also exclude tasks that were completed on the same day based on updated_at
        AND NOT (
          t.status = 'Completed' 
          AND DATE(CONVERT_TZ(t.updated_at, '+00:00', '+05:00')) = ?
        )
        ORDER BY t.priority DESC, t.department, t.assigned_to
      `;

    console.log('🔔 DWM Debug: Executing query with date parameter:', date);
    const [rows] = await connection.execute(query, [date, date]);
    console.log('🔔 DWM Debug: Query result rows:', rows);

    // Format the response for the frontend
    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      employeeName: row.assigned_to || 'Unassigned',
      taskType: row.task_type,
      priority: row.priority || 'Medium',
      status: row.status,
      date: row.date,
      labels: row.labels
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching DWM incomplete notifications:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({
      error: 'Database error',
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Ticket Notifications API Routes
router.get('/', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
                      SELECT 
          tn.id,
          tn.user_id,
          tn.ticket_id,
          tn.notification_type,
          tn.title,
          tn.message,
          tn.is_read,
          tn.created_at,
          tn.read_at,
          t.ticket_number,
          t.title as ticket_title
        FROM ticket_notifications tn
        LEFT JOIN tickets t ON tn.ticket_id = t.id
        WHERE tn.user_id = ?
        ORDER BY tn.created_at DESC
        LIMIT 50
      `;

    const [notifications] = await connection.execute(query, [user_id]);
    res.json(notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.get('/unread-count', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
        SELECT COUNT(*) as unread_count
        FROM ticket_notifications
        WHERE user_id = ? AND is_read = FALSE
      `;

    const [result] = await connection.execute(query, [user_id]);
    res.json({ unread_count: result[0].unread_count });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.put('/:id/read', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
        UPDATE ticket_notifications 
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

    const [result] = await connection.execute(query, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.put('/mark-all-read', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
        UPDATE ticket_notifications 
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND is_read = FALSE
      `;

    const [result] = await connection.execute(query, [user_id]);

    res.json({
      message: 'All notifications marked as read',
      updated_count: result.affectedRows
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [result] = await connection.execute('DELETE FROM ticket_notifications WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.put('/mark-ticket-read', async (req, res) => {
  const { user_id, ticket_id } = req.body;

  if (!user_id || !ticket_id) {
    return res.status(400).json({ error: 'user_id and ticket_id are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
        UPDATE ticket_notifications 
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND ticket_id = ? AND is_read = FALSE
      `;

    const [result] = await connection.execute(query, [user_id, ticket_id]);

    res.json({
      message: 'Ticket notifications marked as read',
      updated_count: result.affectedRows
    });
  } catch (err) {
    console.error('Error marking ticket notifications as read:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});




router.get('/consecutive-absences', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('ca_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    console.log(`Access denied: User role ${userRole} attempted to access CA notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view CA notifications.',
      requiredPermission: 'ca_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log('🔔 Consecutive Absence Notifications: Fetching employees with consecutive absences');

    const [employees] = await connection.execute(`
        SELECT id, name, email, department FROM employees
      `);

    const consecutiveAbsenceEmployees = [];

    for (const employee of employees) {
      const [attendanceRecords] = await connection.execute(`
          SELECT date 
          FROM attendance 
          WHERE employee_id = ? 
          AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          ORDER BY date DESC
        `, [employee.id]);

      const presentDates = new Set(attendanceRecords.map(record => record.date.toISOString().split('T')[0]));

      let maxConsecutiveAbsentDays = 0;
      let currentConsecutiveAbsentDays = 0;

      for (let i = 0; i < 30; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        const dateString = checkDate.toISOString().split('T')[0];

        if (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
          continue;
        }

        if (presentDates.has(dateString)) {
          currentConsecutiveAbsentDays = 0;
        } else {
          currentConsecutiveAbsentDays++;
          maxConsecutiveAbsentDays = Math.max(maxConsecutiveAbsentDays, currentConsecutiveAbsentDays);
        }
      }

      if (maxConsecutiveAbsentDays >= 3) {
        const lastAttendanceDate = attendanceRecords[0]?.date || null;
        consecutiveAbsenceEmployees.push({
          id: employee.id,
          employeeName: employee.name,
          employeeEmail: employee.email,
          department: employee.department || 'Unassigned',
          consecutiveAbsentDays: maxConsecutiveAbsentDays,
          lastAttendanceDate: lastAttendanceDate,
          daysSinceLastAttendance: lastAttendanceDate ?
            Math.floor((new Date() - new Date(lastAttendanceDate)) / (1000 * 60 * 60 * 24)) :
            null
        });
      }
    }

    console.log(`🔔 Consecutive Absence Debug: Found ${consecutiveAbsenceEmployees.length} employees with consecutive absences`);

    res.json(consecutiveAbsenceEmployees);
  } catch (err) {
    console.error('Error fetching consecutive absence notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.get('/missed-tasks', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { days = 7 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('mtw_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    console.log(`Access denied: User role ${userRole} attempted to access MTW notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view MTW notifications.',
      requiredPermission: 'mtw_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log(`🔔 MTW Notifications: Fetching tasks missed for ${days} days`);

    const query = `
        SELECT 
          t.id,
          t.title,
          t.description,
          t.department,
          t.assigned_to,
          t.priority,
          t.status,
          t.created_at,
          t.updated_at,
          t.due_date,
          t.labels,
          DATEDIFF(CURDATE(), t.created_at) as days_since_creation
        FROM tasks t
        WHERE 
          t.status != 'Completed'
          AND DATEDIFF(CURDATE(), t.created_at) >= ?
          AND (
            LOWER(IFNULL(t.labels,'')) NOT LIKE '%daily%'
            AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%weekly%'
            AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%monthly%'
            AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%daily-task%'
            AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%weekly-task%'
            AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%monthly-task%'
          )
        ORDER BY t.department, t.priority DESC, t.created_at ASC
      `;

    console.log('🔔 MTW Debug: Executing query with days parameter:', days);
    const [rows] = await connection.execute(query, [parseInt(days)]);
    console.log(`🔔 MTW Debug: Query result rows: ${rows.length}`);

    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      assignedTo: row.assigned_to || 'Unassigned',
      priority: row.priority || 'Medium',
      status: row.status,
      createdDate: row.created_at,
      updatedDate: row.updated_at,
      dueDate: row.due_date,
      labels: row.labels,
      daysSinceCreation: row.days_since_creation
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching MTW notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.get('/less-trained-employees', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { minTrained = 3 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('lte_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    console.log(`Access denied: User role ${userRole} attempted to access LTE notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view LTE notifications.',
      requiredPermission: 'lte_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log(`🔔 LTE Notifications: Fetching DWM tasks with less than ${minTrained} trained employees`);

    const query = `
        SELECT 
          t.id,
          t.title,
          t.description,
          t.department,
          t.assigned_to,
          t.priority,
          t.status,
          t.created_at,
          t.updated_at,
          t.due_date,
          t.labels,
          t.trained,
          CASE 
            WHEN LOWER(IFNULL(t.labels,'')) LIKE '%daily%' OR LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%' THEN 'Daily'
            WHEN LOWER(IFNULL(t.labels,'')) LIKE '%weekly%' OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%' THEN 'Weekly'
            WHEN LOWER(IFNULL(t.labels,'')) LIKE '%monthly%' OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%' THEN 'Monthly'
            ELSE 'Unknown'
          END as task_type,
          CASE 
            WHEN t.trained IS NULL OR t.trained = '' OR t.trained = 'null' THEN 0
            WHEN JSON_VALID(t.trained) = 0 THEN 0
            ELSE JSON_LENGTH(t.trained)
          END as trained_count
        FROM tasks t
        WHERE 
          (
            LOWER(IFNULL(t.labels,'')) LIKE '%daily%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
          )
          AND (
            t.trained IS NULL 
            OR t.trained = '' 
            OR t.trained = 'null'
            OR JSON_VALID(t.trained) = 0
            OR (JSON_VALID(t.trained) = 1 AND JSON_LENGTH(t.trained) < ?)
          )
        ORDER BY t.department, t.priority DESC, t.created_at ASC
      `;

    console.log('🔔 LTE Debug: Executing query with minTrained parameter:', minTrained);
    const [rows] = await connection.execute(query, [parseInt(minTrained)]);
    console.log(`🔔 LTE Debug: Query result rows: ${rows.length}`);

    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      assignedTo: row.assigned_to || 'Unassigned',
      priority: row.priority || 'Medium',
      status: row.status,
      createdDate: row.created_at,
      updatedDate: row.updated_at,
      dueDate: row.due_date,
      labels: row.labels,
      taskType: row.task_type,
      trained: row.trained,
      trainedCount: row.trained_count,
      requiredCount: parseInt(minTrained)
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching LTE notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Low Hours Employees Notifications API - employees who logged less than threshold hours
router.get('/low-hours-employees', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { date, minHours = 8 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  // Check permission (use lhe_view or fall back to admin/manager role or manager designation/all)
  const isManagerByRole = userRole === 'manager' || userRole === 'Manager';
  const userDesignation = (req.headers['x-user-designation'] || req.headers['user-designation'] || '').toString().trim().toLowerCase();
  const isManagerByDesignation = userDesignation !== '' && userDesignation.includes('manager');
  if (!permissions.includes('lhe_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin' && !isManagerByRole && !isManagerByDesignation) {
    console.log(`Access denied: User role ${userRole} attempted to access Low Hours notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view Low Hours notifications.',
      requiredPermission: 'lhe_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Use provided date or default to today
    const targetDate = date || new Date().toISOString().split('T')[0];
    const minSeconds = parseFloat(minHours) * 3600; // Convert hours to seconds
    // Same date range as consolidated timelog report: start 00:00:00 to end 23:59:59
    const startDate = `${targetDate} 00:00:00`;
    const endDate = `${targetDate} 23:59:59`;

    console.log(`🔔 Low Hours Notifications: Fetching employees who logged less than ${minHours} hours on ${targetDate}`);

    const query = `
        SELECT 
          e.id,
          e.name,
          e.employee_id,
          e.department,
          e.designation,
          e.working_hours,
          COALESCE(SUM(
            CASE 
              WHEN tt.hours_logged_seconds IS NOT NULL AND tt.hours_logged_seconds != 0 
                THEN ABS(tt.hours_logged_seconds)
              WHEN tt.hours_logged IS NOT NULL AND tt.hours_logged != 0 
                THEN ABS(tt.hours_logged)
              WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN 
                ABS(TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time))
              ELSE 0
            END
          ), 0) as total_seconds
        FROM employees e
        LEFT JOIN task_timesheet tt ON tt.employee_name = e.name
          AND tt.start_time >= ? AND tt.start_time <= ?
        WHERE e.status = 'Active'
        GROUP BY e.id, e.name, e.employee_id, e.department, e.designation, e.working_hours
        HAVING total_seconds < ?
        ORDER BY total_seconds ASC, e.department, e.name
      `;

    console.log('🔔 Low Hours Debug: Executing query with date range and minSeconds:', startDate, endDate, minSeconds);
    const [rows] = await connection.execute(query, [startDate, endDate, minSeconds]);
    console.log(`🔔 Low Hours Debug: Query result rows: ${rows.length}`);

    const formattedNotifications = rows.map(row => ({
      employeeId: row.id,
      employeeName: row.name,
      employeeCode: row.employee_id,
      department: row.department || 'Unassigned',
      designation: row.designation || '',
      shiftHours: row.working_hours || 8,
      loggedSeconds: parseInt(row.total_seconds) || 0,
      loggedHours: ((parseInt(row.total_seconds) || 0) / 3600).toFixed(2),
      requiredHours: parseFloat(minHours),
      shortfallSeconds: Math.max(0, minSeconds - (parseInt(row.total_seconds) || 0)),
      shortfallHours: Math.max(0, parseFloat(minHours) - ((parseInt(row.total_seconds) || 0) / 3600)).toFixed(2),
      date: targetDate
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching Low Hours notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
router.get('/low-idle-employees', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { date, startDate, endDate, maxIdleHours, minIdleHours = 3, minIdleMinutes = 0 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('low_idle_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view Low Idle notifications.',
      requiredPermission: 'low_idle_view'
    });
  }

  const apiKey = process.env.TEAMLOGGER_API_KEY;
  if (!apiKey) {
    console.error('Low Idle: Team Logger API key not configured');
    return res.status(503).json({ error: 'Team Logger API is not configured. Set TEAMLOGGER_API_KEY environment variable.' });
  }

  const today = new Date().toISOString().split('T')[0];
  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : s);
  let start = norm(startDate || date || today);
  let end = norm(endDate || date || today);
  if (end < start) {
    [start, end] = [end, start];
  }

  const minH = parseFloat(minIdleHours);
  const minM = parseFloat(minIdleMinutes);
  const thresholdHours = (Number.isNaN(minH) ? 3 : minH) + (Number.isNaN(minM) ? 0 : minM) / 60;
  if (thresholdHours < 0) {
    return res.status(400).json({ error: 'minIdleHours and minIdleMinutes must be non-negative' });
  }

  const { startMs, endMs } = getEpochMsForRange(start, end);

  try {
    // GET only - Employee Summary Report per API doc; no database
    // Use validateStatus so we handle 4xx/5xx without throwing and can return a clear error to the client
    const response = await axios.get(TEAMLOGGER_EMPLOYEE_SUMMARY_REPORT_URL, {
      params: { startTime: startMs, endTime: endMs },
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 30000,
      validateStatus: () => true
    });

    if (response.status !== 200) {
      const body = response.data;
      const msg = body && (typeof body === 'object' ? (body.message || body.error || JSON.stringify(body).slice(0, 200)) : String(body).slice(0, 200));
      console.error('Low Idle: Team Logger API returned', response.status, msg || response.statusText);
      return res.status(502).json({
        error: 'Idle data service returned an error',
        message: msg || `HTTP ${response.status}`,
        status: response.status
      });
    }

    const responseData = response.data;
    // Employee summary report returns idle time as idleHours (decimal hours) and/or inactiveSecondsCount (seconds)
    // API may return array, or { data: array }; ensure we always have an array to avoid .filter/.map throwing
    const rows = Array.isArray(responseData)
      ? responseData
      : (Array.isArray(responseData?.data) ? responseData.data : []);
    // Filter: show only employees with idle time *more than* threshold (high idle in range)
    let list = rows
      .filter((row) => {
        const idleH = getIdleHours(row);
        return idleH >= thresholdHours;
      })
      .map((row) => {
        const idleH = getIdleHours(row);
        return {
          employeeName: (row.title ?? row.name ?? row.employeeName ?? '').toString().trim(),
          email: (row.email ?? '').toString().trim(),
          employeeCode: (row.code ?? row.employeeCode ?? '').toString().trim(),
          idleHours: Number(Number(idleH).toFixed(2)),
          dateRange: `${start} to ${end}`
        };
      })
      .sort((a, b) => b.idleHours - a.idleHours);

    console.log('Low Idle: start=%s end=%s minIdle=%sh %sm rowsFromApi=%d afterFilter=%d', start, end, minH, minM, rows.length, list.length);

    // Enrich with EMS department: match by email first, then by name (so department filter has real options)
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      const [empRows] = await connection.execute(
        'SELECT LOWER(TRIM(email)) AS email, LOWER(TRIM(name)) AS name_key, department, name FROM employees WHERE status = ?',
        ['Active']
      );
      const emailToDept = {};
      const nameToDept = {};
      for (const r of empRows) {
        const dept = r.department || 'Unassigned';
        if (r.email) emailToDept[r.email] = dept;
        if (r.name_key) nameToDept[r.name_key] = dept;
      }
      list = list.map((item) => {
        const emailKey = (item.email || '').toString().trim().toLowerCase();
        const nameKey = (item.employeeName || '').toString().trim().toLowerCase();
        const department = emailToDept[emailKey] || nameToDept[nameKey] || 'Unassigned';
        return {
          ...item,
          department,
          idleSeconds: Math.round(Number(item.idleHours) * 3600)
        };
      });
    } catch (dbErr) {
      console.error('Low Idle: DB enrichment failed (returning list without department):', dbErr.message || dbErr);
      // Still return list with minimal enrichment so the UI shows idle data
      list = list.map((item) => ({
        ...item,
        department: 'Unassigned',
        idleSeconds: Math.round(Number(item.idleHours) * 3600)
      }));
    } finally {
      if (connection) try { connection.release(); } catch (e) { /* ignore */ }
    }

    res.set('X-Low-Idle-StartDate', start);
    res.set('X-Low-Idle-EndDate', end);
    res.set('X-Low-Idle-MinHours', String(thresholdHours));
    res.set('X-Low-Idle-Count', String(list.length));

    // Also upsert idle accountability entries when a single day is requested
    try {
      // Only when start and end represent the same day
      if (start === end && list.length > 0) {
        const thresholdMinutesForAccount =
          (Number.isNaN(minH) ? 0 : minH * 60) + (Number.isNaN(minM) ? 0 : minM);
        await upsertIdleAccountabilityFromListForDate(
          list,
          start,
          thresholdMinutesForAccount > 0 ? thresholdMinutesForAccount : 20
        );
      }
    } catch (e) {
      console.error('Idle accountability upsert from low-idle route failed:', e.message || e);
      // Do not fail the notifications response if upsert fails
    }

    res.json(list);
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('Error fetching Low Idle (Team Logger):', status || 'no-status', msg, err.stack || '');
    res.status(status === 401 ? 502 : 500).json({
      error: 'Failed to fetch idle data from tracking app',
      message: msg || (err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : 'Unknown error')
    });
  }
});
// Currently idle employees – same Team Logger API with a short rolling window (e.g. last 15 min)
router.get('/currently-idle-employees', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { windowMinutes = 15, minIdleMinutes = 1 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }
  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }
  if (!permissions.includes('low_idle_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view idle notifications.',
      requiredPermission: 'low_idle_view'
    });
  }

  const apiKey = process.env.TEAMLOGGER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Team Logger API is not configured. Set TEAMLOGGER_API_KEY environment variable.' });
  }

  const winM = Math.max(1, Math.min(60, parseInt(String(windowMinutes), 10) || 15));
  const minM = Math.max(0, parseInt(String(minIdleMinutes), 10) || 1);
  const thresholdHours = minM / 60;
  const endMs = Date.now();
  const startMs = endMs - winM * 60 * 1000;

  try {
    const response = await axios.get(TEAMLOGGER_EMPLOYEE_SUMMARY_REPORT_URL, {
      params: { startTime: startMs, endTime: endMs },
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 30000,
      validateStatus: () => true
    });

    if (response.status !== 200) {
      const body = response.data;
      const msg = body && (typeof body === 'object' ? (body.message || body.error || JSON.stringify(body).slice(0, 200)) : String(body).slice(0, 200));
      console.error('Currently Idle: Team Logger API returned', response.status, msg || response.statusText);
      return res.status(502).json({
        error: 'Idle data service returned an error',
        message: msg || `HTTP ${response.status}`,
        status: response.status
      });
    }

    const responseData = response.data;
    const rows = Array.isArray(responseData)
      ? responseData
      : (Array.isArray(responseData?.data) ? responseData.data : []);

    let list = rows
      .filter((row) => {
        const idleH = getIdleHours(row);
        return idleH >= thresholdHours;
      })
      .map((row) => {
        const idleH = getIdleHours(row);
        return {
          employeeName: (row.title ?? row.name ?? row.employeeName ?? '').toString().trim(),
          email: (row.email ?? '').toString().trim(),
          employeeCode: (row.code ?? row.employeeCode ?? '').toString().trim(),
          idleHours: Number(Number(idleH).toFixed(2)),
          dateRange: `Last ${winM} min`,
          windowMinutes: winM
        };
      })
      .sort((a, b) => b.idleHours - a.idleHours);

    let connection;
    try {
      connection = await mysqlPool.getConnection();
      const [empRows] = await connection.execute(
        'SELECT LOWER(TRIM(email)) AS email, LOWER(TRIM(name)) AS name_key, department, name FROM employees WHERE status = ?',
        ['Active']
      );
      const emailToDept = {};
      const nameToDept = {};
      for (const r of empRows) {
        const dept = r.department || 'Unassigned';
        if (r.email) emailToDept[r.email] = dept;
        if (r.name_key) nameToDept[r.name_key] = dept;
      }
      list = list.map((item) => {
        const emailKey = (item.email || '').toString().trim().toLowerCase();
        const nameKey = (item.employeeName || '').toString().trim().toLowerCase();
        const department = emailToDept[emailKey] || nameToDept[nameKey] || 'Unassigned';
        return {
          ...item,
          department,
          idleSeconds: Math.round(Number(item.idleHours) * 3600)
        };
      });
    } catch (dbErr) {
      console.error('Currently Idle: DB enrichment failed:', dbErr.message || dbErr);
      list = list.map((item) => ({
        ...item,
        department: 'Unassigned',
        idleSeconds: Math.round(Number(item.idleHours) * 3600)
      }));
    } finally {
      if (connection) try { connection.release(); } catch (e) { /* ignore */ }
    }

    res.set('X-Currently-Idle-WindowMinutes', String(winM));
    res.set('X-Currently-Idle-Count', String(list.length));
    res.json(list);
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('Error fetching Currently Idle (Team Logger):', status || 'no-status', msg, err.stack || '');
    res.status(status === 401 ? 502 : 500).json({
      error: 'Failed to fetch currently idle data',
      message: msg || (err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : 'Unknown error')
    });
  }
});
// Tasks Over Estimate Notifications - admin/reporting API
router.get('/tasks-over-estimate', async (req, res) => {
  const { start, end, designation, min_over_minutes } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });
  }

  // Permissions: only admins or users with global view permissions can access
  const userRoleHeader = req.headers['x-user-role'] || req.headers['user-role'] || 'employee';
  const userPermissionsHeader = req.headers['x-user-permissions'] || req.headers['user-permissions'] || '[]';
  let userPermissions = [];
  try {
    userPermissions = typeof userPermissionsHeader === 'string'
      ? JSON.parse(userPermissionsHeader)
      : [];
  } catch (e) {
    console.warn('Invalid permissions format for tasks-over-estimate:', userPermissionsHeader);
    userPermissions = [];
  }
  const role = (userRoleHeader || '').toLowerCase();
  const userDesignation = (req.headers['x-user-designation'] || req.headers['user-designation'] || '').toString().trim().toLowerCase();
  const isManagerByDesignation = userDesignation !== '' && userDesignation.includes('manager');
  const hasAccess =
    role === 'admin' ||
    role === 'manager' ||
    isManagerByDesignation ||
    userPermissions.includes('all') ||
    userPermissions.includes('view_overestimate_tasks');

  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied: You do not have permission to view over-estimate tasks' });
  }

  // Build time window
  const params = [];
  let where = `tt.start_time >= ? AND tt.start_time <= ?`;
  const startDate = `${start} 00:00:00`;
  const endDate = `${end} 23:59:59`;
  params.push(startDate, endDate);

  // Optional designation filter via employees table
  if (designation) {
    where += ` AND e.designation = ?`;
    params.push(designation);
  }

  const minOverMinutes = Number.isFinite(Number(min_over_minutes))
    ? Math.max(0, Number(min_over_minutes))
    : 10;
  const minOverSeconds = minOverMinutes * 60;

  const query = `
      SELECT
        tt.task_id,
        t.title AS task_title,
        t.labels,
        t.priority,
        t.department,
        tt.employee_name,
        e.designation,
        DATE(tt.start_time) AS log_date,
        MAX(COALESCE(t.time_estimate_hours, 0)) AS time_estimate_hours,
        MAX(COALESCE(t.time_estimate_minutes, 0)) AS time_estimate_minutes,
        SUM(
          CASE 
            WHEN tt.hours_logged_seconds IS NOT NULL AND tt.hours_logged_seconds != 0 
              THEN ABS(tt.hours_logged_seconds)
            WHEN tt.hours_logged IS NOT NULL AND tt.hours_logged != 0 
              THEN ABS(tt.hours_logged)
            WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN 
              ABS(TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time))
            ELSE 0
          END
        ) AS actual_seconds
      FROM task_timesheet tt
      LEFT JOIN tasks t ON t.id = tt.task_id
      LEFT JOIN employees e ON e.name = tt.employee_name
      WHERE ${where}
      GROUP BY
        tt.task_id,
        t.title,
        t.labels,
        t.priority,
        tt.employee_name,
        e.designation,
        t.department,
        DATE(tt.start_time)
      ORDER BY log_date DESC, actual_seconds DESC
    `;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query, params);

    // Map to a cleaner shape for the frontend
    const items = rows.map(row => {
      // Compute estimateSeconds from hours and minutes only (no fallback column in this schema)
      const estHours = Number(row.time_estimate_hours) || 0;
      const estMinutes = Number(row.time_estimate_minutes) || 0;
      let estimateSeconds = 0;
      if (estHours > 0 || estMinutes > 0) {
        estimateSeconds = (estHours * 60 + estMinutes) * 60;
      }
      const actualSeconds = Number(row.actual_seconds) || 0;
      const overrunSeconds = Math.max(0, actualSeconds - estimateSeconds);
      return {
        task_id: row.task_id,
        task_title: row.task_title,
        labels: row.labels,
        priority: row.priority,
        department: row.department || null,
        employee_name: row.employee_name,
        designation: row.designation,
        log_date: row.log_date,
        estimate_seconds: estimateSeconds,
        actual_seconds: actualSeconds,
        overrun_seconds: overrunSeconds
      };
    }).filter(r => r.overrun_seconds >= minOverSeconds && r.estimate_seconds > 0);

    res.json({ items });
  } catch (err) {
    console.error('Tasks over estimate query error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
router.get('/clet-notifications', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('clet_view') && !permissions.includes('all') && userRole !== 'admin') {
    console.log(`Access denied: User role ${userRole} attempted to access CLET notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view CLET notifications.',
      requiredPermission: 'clet_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log('🔔 CLET Notifications: Fetching tasks missing checklist or estimated time');

    const query = `
        SELECT DISTINCT
          t.id,
          t.title,
          t.description,
          t.department,
          t.assigned_to,
          t.labels,
          t.priority,
          t.status,
          t.time_estimate_hours,
          t.time_estimate_minutes,
          t.checklist,
          CASE
            WHEN LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%' OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%' THEN 'Daily Task'
            WHEN LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%' OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%' THEN 'Weekly Task'
            WHEN LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%' OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%' THEN 'Monthly Task'
            ELSE 'Unknown'
          END as task_type,
          CASE
            WHEN (t.time_estimate_hours IS NULL OR t.time_estimate_hours = 0)
                 AND (t.time_estimate_minutes IS NULL OR t.time_estimate_minutes = 0)
                 AND (t.checklist IS NULL OR t.checklist = '' OR t.checklist = '[]' OR t.checklist = 'null')
            THEN 'Both Missing'
            WHEN (t.time_estimate_hours IS NULL OR t.time_estimate_hours = 0)
                 AND (t.time_estimate_minutes IS NULL OR t.time_estimate_minutes = 0)
            THEN 'Estimated Time Missing'
            WHEN (t.checklist IS NULL OR t.checklist = '' OR t.checklist = '[]' OR t.checklist = 'null')
            THEN 'Checklist Missing'
            ELSE 'Unknown'
          END as missing_type
        FROM tasks t
        WHERE (
          LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%'
        )
        AND (
          ((t.time_estimate_hours IS NULL OR t.time_estimate_hours = 0)
           AND (t.time_estimate_minutes IS NULL OR t.time_estimate_minutes = 0))
          OR (t.checklist IS NULL OR t.checklist = '' OR t.checklist = '[]' OR t.checklist = 'null')
        )
        AND t.status != 'Completed'
        ORDER BY t.priority DESC, t.department, t.assigned_to
      `;

    console.log('🔔 CLET Debug: Executing CLET query');
    const [rows] = await connection.execute(query);
    console.log('🔔 CLET Debug: Query result rows:', rows.length);

    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      employeeName: row.assigned_to || 'Unassigned',
      taskType: row.task_type,
      priority: row.priority || 'Medium',
      status: row.status,
      labels: row.labels,
      timeEstimateHours: row.time_estimate_hours,
      timeEstimateMinutes: row.time_estimate_minutes,
      checklist: row.checklist,
      missingType: row.missing_type
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching CLET notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;