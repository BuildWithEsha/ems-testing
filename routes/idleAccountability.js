const router = require('express').Router();
const adminRouter = require('express').Router();
const wagesRouter = require('express').Router();
const notificationsRouter = require('express').Router();
const axios = require('axios');
const { mysqlPool } = require('../config/database');

// ===== Team Logger Constants =====
const TEAMLOGGER_EMPLOYEE_SUMMARY_REPORT_URL = 'https://api2.teamlogger.com/api/employee_summary_report';

// ===== Idle Reason Categories =====
const IDLE_REASON_CATEGORIES = [
  {
    key: 'personal',
    label: 'Personal',
    subcategories: [
      { key: 'health', label: 'Health related' },
      { key: 'family', label: 'Family emergency' },
      { key: 'break', label: 'Extended break' }
    ]
  },
  {
    key: 'work_process',
    label: 'Work / Process',
    subcategories: [
      { key: 'waiting_requirements', label: 'Waiting for requirements' },
      { key: 'waiting_approvals', label: 'Waiting for approvals' },
      { key: 'tool_issues', label: 'Tool/infra issues' }
    ]
  },
  {
    key: 'other',
    label: 'Other',
    subcategories: [
      { key: 'misc', label: 'Miscellaneous' }
    ]
  }
];

// ===== Utility Functions =====
function getEpochMsForDay(dateStr, timezoneOffsetMinutes = 330) {
  const midnightUtc = new Date(dateStr + 'T00:00:00.000Z').getTime();
  const startMs = midnightUtc - timezoneOffsetMinutes * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { startMs, endMs };
}

function getEpochMsForRange(startDateStr, endDateStr, timezoneOffsetMinutes = 330) {
  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : s);
  const start = norm(startDateStr);
  const end = norm(endDateStr);
  const { startMs } = getEpochMsForDay(start, timezoneOffsetMinutes);
  const endDay = getEpochMsForDay(end, timezoneOffsetMinutes);
  const endMs = endDay.startMs + 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

function getIdleHours(row) {
  if (!row || typeof row !== 'object') return 0;
  const h = row.idleHours ?? row.idle_hours ?? row.IdleHours;
  if (h != null && h !== '') {
    const num = typeof h === 'number' ? h : parseFloat(h);
    if (!Number.isNaN(num)) return num;
  }
  const sec = row.inactiveSecondsCount ?? row.inactive_seconds_count ?? row.InactiveSecondsCount;
  if (sec != null && sec !== '') {
    const num = typeof sec === 'number' ? sec : parseFloat(sec);
    if (!Number.isNaN(num)) return num / 3600;
  }
  const keys = Object.keys(row);
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (lower.includes('idle') && !lower.includes('inactive') && !lower.includes('second')) {
      const v = row[k];
      if (v != null && v !== '') {
        const num = typeof v === 'number' ? v : parseFloat(v);
        if (!Number.isNaN(num)) return num;
      }
    }
    if (lower.includes('inactive') && (lower.includes('second') || lower.includes('count'))) {
      const v = row[k];
      if (v != null && v !== '') {
        const num = typeof v === 'number' ? v : parseFloat(v);
        if (!Number.isNaN(num)) return num / 3600;
      }
    }
  }
  return 0;
}

// ===== Internal Helpers =====

// Upsert idle_accountability rows from a list of high-idle employees for a specific date
async function upsertIdleAccountabilityFromListForDate(list, date, thresholdMinutes) {
  if (!Array.isArray(list) || list.length === 0) return;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [empRows] = await connection.execute(
      'SELECT id, LOWER(TRIM(email)) AS email_key, LOWER(TRIM(name)) AS name_key, email FROM employees WHERE status = ?',
      ['Active']
    );
    const emailToEmp = {};
    const nameToEmp = {};
    for (const r of empRows) {
      if (r.email_key) emailToEmp[r.email_key] = { id: r.id, email: r.email };
      if (r.name_key) nameToEmp[r.name_key] = { id: r.id, email: r.email };
    }

    const insertSql = `
      INSERT INTO idle_accountability (
        employee_id, employee_email, date, idle_hours, idle_minutes, threshold_minutes
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        idle_hours = VALUES(idle_hours),
        idle_minutes = VALUES(idle_minutes),
        threshold_minutes = VALUES(threshold_minutes),
        updated_at = CURRENT_TIMESTAMP
    `;

    let count = 0;
    for (const item of list) {
      const idleH = Number(item.idleHours ?? 0);
      const idleM = Math.round(idleH * 60);
      if (!Number.isFinite(idleM) || idleM < thresholdMinutes) continue;

      const rawEmail = (item.email ?? '').toString().trim();
      const name = (item.employeeName ?? '').toString().trim();
      const emailKey = rawEmail.toLowerCase();
      const nameKey = name.toLowerCase();

      let emp = null;
      if (emailKey && emailToEmp[emailKey]) emp = emailToEmp[emailKey];
      else if (nameKey && nameToEmp[nameKey]) emp = nameToEmp[nameKey];

      const employeeId = emp ? emp.id : null;
      const employeeEmail = rawEmail || (emp ? emp.email : null) || null;

      await connection.execute(insertSql, [
        employeeId, employeeEmail, date, Number(idleH.toFixed(4)), idleM, thresholdMinutes
      ]);
      count += 1;
    }

    console.log('Idle accountability upsert complete for date=%s, rowsFromList=%d, createdOrUpdated=%d (threshold=%dmin)', date, list.length, count, thresholdMinutes);
  } catch (e) {
    console.error('Idle accountability upsert failed:', e.message || e);
  } finally {
    if (connection) try { connection.release(); } catch (e) { /* ignore */ }
  }
}

// Auto-create high-priority tickets for idle accountability records without submitted reasons
async function createIdleTicketsForDate(targetDate, opts = {}) {
  const todayIso = new Date().toISOString().split('T')[0];
  const date = (targetDate || todayIso).split('T')[0];
  const { department, designation, title: customTitle, description: customDescription, createdBy } = opts || {};

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const clauses = ['ia.date = ?', "ia.status IN ('pending', 'ticket_created')", 'ia.idle_minutes > 20'];
    const params = [date];

    if (department) {
      clauses.push('(e.department = ? OR (e.department IS NULL AND ? = \'Unassigned\'))');
      params.push(department, department);
    }
    if (designation) {
      clauses.push('e.designation = ?');
      params.push(designation);
    }

    const where = clauses.join(' AND ');

    const [rows] = await connection.execute(
      `SELECT ia.*, e.name AS employee_name, e.department, e.designation
       FROM idle_accountability ia
       LEFT JOIN employees e ON ia.employee_id = e.id
       WHERE ${where}`,
      params
    );

    if (!rows.length) return { date, ticketsCreated: 0 };

    let ticketsCreated = 0;

    for (const row of rows) {
      const employeeId = row.employee_id;
      const employeeName = row.employee_name || row.employee_email || 'Employee';
      const dept = row.department || 'Unassigned';
      const dateOnly = row.date ? new Date(row.date).toISOString().split('T')[0] : date;

      const title = customTitle || `High idle time on ${dateOnly} – reason not submitted`;
      const descriptionHeader = customDescription || 'This ticket was auto-created because idle time accountability was not submitted.';
      const description =
        `${descriptionHeader}\n\nDate: ${dateOnly}\nEmployee: ${employeeName}\nDepartment: ${dept}\nIdle time: ${row.idle_minutes} minutes\n`;

      const [maxIdRow] = await connection.execute('SELECT MAX(id) AS maxId FROM tickets');
      const maxId = maxIdRow && maxIdRow[0] && maxIdRow[0].maxId ? Number(maxIdRow[0].maxId) : 0;
      const nextId = maxId + 1;
      const ticketNumber = `T-${String(nextId).padStart(6, '0')}`;

      const [ticketResult] = await connection.execute(
        `INSERT INTO tickets (ticket_number, title, description, category, priority, status, assigned_to, department, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ticketNumber, title, description, 'Idle Time', 'High', 'Open', employeeId || null, dept, createdBy || null]
      );

      const ticketId = ticketResult.insertId;

      await connection.execute(
        `UPDATE idle_accountability SET status = 'ticket_created', ticket_id = ?, updated_at = NOW() WHERE id = ?`,
        [ticketId, row.id]
      );

      ticketsCreated += 1;
    }

    console.log('Idle tickets auto-created for date=%s, ticketsCreated=%d (pending rows=%d)', date, ticketsCreated, rows.length);
    return { date, ticketsCreated };
  } finally {
    if (connection) try { connection.release(); } catch (e) { /* ignore */ }
  }
}

// Run idle accountability detection for a single date
async function runIdleAccountabilityForDate(targetDate) {
  const apiKey = process.env.TEAMLOGGER_API_KEY;
  if (!apiKey) {
    throw new Error('Team Logger API key is not configured. Set TEAMLOGGER_API_KEY environment variable.');
  }

  const todayIso = new Date().toISOString().split('T')[0];
  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : s);
  const today = norm(todayIso);
  let date = targetDate ? norm(targetDate) : today;

  if (!targetDate) {
    const d = new Date(today + 'T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().split('T')[0];
  }

  const { startMs, endMs } = getEpochMsForRange(date, date);

  const response = await axios.get(TEAMLOGGER_EMPLOYEE_SUMMARY_REPORT_URL, {
    params: { startTime: startMs, endTime: endMs },
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 30000,
    validateStatus: () => true
  });

  if (response.status !== 200) {
    const body = response.data;
    const msg = body && (typeof body === 'object' ? (body.message || body.error || JSON.stringify(body).slice(0, 200)) : String(body).slice(0, 200));
    throw new Error(`Team Logger employee_summary_report failed (${response.status}): ${msg || 'no message'}`);
  }

  const responseData = response.data;
  const rows = Array.isArray(responseData) ? responseData : (Array.isArray(responseData?.data) ? responseData.data : []);
  const thresholdMinutes = 20;

  const employeeKey = (row) => {
    const name = (row.title ?? row.name ?? row.employeeName ?? '').toString().trim();
    const email = (row.email ?? '').toString().trim();
    const code = (row.code ?? row.employeeCode ?? '').toString().trim();
    return (email || name || code || 'unknown').toLowerCase();
  };

  const aggregated = {};
  for (const row of rows) {
    const idleH = getIdleHours(row);
    const idleM = Math.round(Number(idleH) * 60);
    if (!Number.isFinite(idleM) || idleM < thresholdMinutes) continue;

    const key = employeeKey(row);
    if (!aggregated[key]) {
      aggregated[key] = {
        employeeName: (row.title ?? row.name ?? row.employeeName ?? '').toString().trim(),
        email: (row.email ?? '').toString().trim(),
        employeeCode: (row.code ?? row.employeeCode ?? '').toString().trim(),
        idleHours: 0
      };
    }
    aggregated[key].idleHours += idleH;
  }

  const list = Object.values(aggregated).map((agg) => ({
    employeeName: agg.employeeName,
    email: agg.email,
    employeeCode: agg.employeeCode,
    idleHours: Number(Number(agg.idleHours).toFixed(4))
  }));

  await upsertIdleAccountabilityFromListForDate(list, date, thresholdMinutes);

  console.log('Idle accountability run complete for date=%s, rowsFromApi=%d, aggregatedEmployees=%d (threshold=%dmin)', date, rows.length, list.length, thresholdMinutes);
  return { date, rowsFromApi: rows.length, processed: list.length, thresholdMinutes };
}

// Helper: reset recurring tasks to Pending
async function resetRecurringTasks(callback) {
  const sql = `
    UPDATE tasks
    SET status = 'Pending', updated_at = CURRENT_TIMESTAMP
    WHERE LOWER(IFNULL(labels,'')) LIKE '%daily%'
       OR LOWER(IFNULL(labels,'')) LIKE '%weekly%'
       OR LOWER(IFNULL(labels,'')) LIKE '%monthly%'
  `;
  try {
    const [result] = await mysqlPool.execute(sql);
    if (typeof callback === 'function') callback(null, result.affectedRows);
  } catch (err) {
    if (typeof callback === 'function') callback(err, 0);
  }
}

// ============================
// ROUTES: /api/idle-accountability
// ============================

// GET /api/idle-accountability/categories
router.get('/categories', (req, res) => {
  res.json(IDLE_REASON_CATEGORIES);
});

// GET /api/idle-accountability/my - Employee's own idle items
router.get('/my', async (req, res) => {
  const userId = Number(req.headers['x-user-id'] || req.headers['user-id'] || 0);
  const userEmailHeader = (req.headers['x-user-email'] || req.headers['user-email'] || '').toString().trim();

  if (!userId && !userEmailHeader) {
    return res.status(401).json({ error: 'User identification required (user-id or user-email header).' });
  }

  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : s);
  const { from, to } = req.query || {};

  const today = new Date();
  const defaultTo = norm(today.toISOString().split('T')[0]);
  const dFrom = new Date(today);
  dFrom.setDate(dFrom.getDate() - 30);
  const defaultFrom = dFrom.toISOString().split('T')[0];

  const fromDate = norm(from || defaultFrom);
  const toDate = norm(to || defaultTo);

  let connection;
  try {
    if (fromDate && toDate && fromDate === toDate) {
      try {
        await runIdleAccountabilityForDate(fromDate);
      } catch (e) {
        console.error('Idle accountability my: background generation failed for date', fromDate, e.message || e);
      }
    }
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const params = [];
    let where = 'ia.date BETWEEN ? AND ?';
    params.push(fromDate, toDate);

    if (userId) {
      where += ' AND (ia.employee_id = ?';
      params.push(userId);
      if (userEmailHeader) {
        where += ' OR (ia.employee_id IS NULL AND LOWER(ia.employee_email) = LOWER(?))';
        params.push(userEmailHeader);
      }
      where += ')';
    } else if (userEmailHeader) {
      where += ' AND LOWER(ia.employee_email) = LOWER(?)';
      params.push(userEmailHeader);
    }

    const sql = `
      SELECT ia.*, e.name AS employee_name, e.department
      FROM idle_accountability ia
      LEFT JOIN employees e ON ia.employee_id = e.id
      WHERE ${where}
      ORDER BY ia.date DESC, ia.id DESC
    `;

    const [rows] = await connection.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching my idle accountability items:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch idle accountability items', message: err.message || 'Unknown error' });
  } finally {
    if (connection) try { connection.release(); } catch (e) { /* ignore */ }
  }
});

// POST /api/idle-accountability/:id/reason - Submit reason
router.post('/:id/reason', async (req, res) => {
  const { id } = req.params;
  const userId = Number(req.headers['x-user-id'] || req.headers['user-id'] || 0);
  const userEmailHeader = (req.headers['x-user-email'] || req.headers['user-email'] || '').toString().trim();

  if (!userId && !userEmailHeader) {
    return res.status(401).json({ error: 'User identification required (user-id or user-email header).' });
  }

  const { category, subcategory, reason } = req.body || {};
  if (!category || !subcategory || !reason || !reason.toString().trim()) {
    return res.status(400).json({ error: 'category, subcategory and reason are required.' });
  }

  const cat = IDLE_REASON_CATEGORIES.find((c) => c.key === category);
  if (!cat) return res.status(400).json({ error: 'Invalid category.' });
  const sub = cat.subcategories.find((s) => s.key === subcategory);
  if (!sub) return res.status(400).json({ error: 'Invalid subcategory.' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const params = [category, subcategory, reason.toString().trim(), id];
    let where = 'id = ?';

    if (userId) {
      where += ' AND (employee_id = ?';
      params.push(userId);
      if (userEmailHeader) {
        where += ' OR (employee_id IS NULL AND LOWER(employee_email) = LOWER(?))';
        params.push(userEmailHeader);
      }
      where += ')';
    } else if (userEmailHeader) {
      where += ' AND LOWER(employee_email) = LOWER(?)';
      params.push(userEmailHeader);
    }

    const sql = `
      UPDATE idle_accountability
      SET category = ?, subcategory = ?, reason_text = ?, status = 'submitted', submitted_at = NOW(), updated_at = NOW()
      WHERE ${where} AND status IN ('pending', 'ticket_created')
    `;

    const [result] = await connection.execute(sql, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Idle accountability record not found or not editable.' });
    }

    res.json({ message: 'Reason submitted successfully', id: Number(id) });
  } catch (err) {
    console.error('Error submitting idle accountability reason:', err.message || err);
    res.status(500).json({ error: 'Failed to submit reason', message: err.message || 'Unknown error' });
  } finally {
    if (connection) try { connection.release(); } catch (e) { /* ignore */ }
  }
});

// ============================
// ROUTES: /api/admin (adminRouter)
// ============================

// GET /api/admin/idle-accountability - Admin listing
adminRouter.get('/idle-accountability', async (req, res) => {
  const userRoleHeader = req.headers['user-role'] || req.headers['x-user-role'] || 'employee';
  const userRole = String(userRoleHeader || '').toLowerCase();
  const permsHeader = req.headers['user-permissions'] || req.headers['x-user-permissions'] || '[]';
  let perms = [];
  try { perms = typeof permsHeader === 'string' ? JSON.parse(permsHeader) : []; } catch { /* ignore */ }

  const isAdmin = userRole === 'admin';
  if (!isAdmin && !perms.includes('all') && !perms.includes('idle_accountability_admin_view')) {
    return res.status(403).json({ error: 'Access denied. Idle accountability admin view is for admins only.' });
  }

  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : s);
  const { from, to, status, department, category } = req.query || {};

  const todayIso = new Date().toISOString().split('T')[0];
  const today = norm(todayIso);
  const dFrom = new Date(todayIso + 'T00:00:00.000Z');
  dFrom.setUTCDate(dFrom.getUTCDate() - 30);
  const defaultFrom = dFrom.toISOString().split('T')[0];

  const fromDate = norm(from || defaultFrom);
  const toDate = norm(to || today);

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const clauses = ['ia.date BETWEEN ? AND ?'];
    const params = [fromDate, toDate];

    if (status) { clauses.push('ia.status = ?'); params.push(status); }
    if (department) {
      clauses.push('(e.department = ? OR (e.department IS NULL AND ? = \'Unassigned\'))');
      params.push(department, department);
    }
    if (category) { clauses.push('ia.category = ?'); params.push(category); }
    clauses.push('ia.idle_minutes > 20');

    const where = clauses.join(' AND ');

    const sql = `
      SELECT ia.*, e.name AS employee_name, e.department, e.designation
      FROM idle_accountability ia
      LEFT JOIN employees e ON ia.employee_id = e.id
      WHERE ${where}
      ORDER BY ia.date DESC, ia.id DESC
      LIMIT 500
    `;

    const [rows] = await connection.execute(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching idle accountability admin list:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch idle accountability admin list', message: err.message || 'Unknown error' });
  } finally {
    if (connection) try { connection.release(); } catch (e) { /* ignore */ }
  }
});

// POST /api/admin/idle-accountability/run - Manual trigger
adminRouter.post('/idle-accountability/run', async (req, res) => {
  try {
    const { date } = req.body || {};
    const result = await runIdleAccountabilityForDate(date);
    res.json({ message: 'Idle accountability run completed', ...result });
  } catch (err) {
    console.error('Idle accountability run failed:', err.message || err);
    res.status(500).json({ error: 'Idle accountability run failed', message: err.message || 'Unknown error' });
  }
});

// POST /api/admin/reset-recurring - Reset recurring tasks to Pending
adminRouter.post('/reset-recurring', async (req, res) => {
  try {
    await resetRecurringTasks((err, changes) => {
      if (err) {
        console.error('Manual recurring reset failed:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Recurring tasks reset to Pending', rowsAffected: changes || 0, at: new Date().toISOString() });
    });
  } catch (error) {
    console.error('Manual recurring reset failed:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================
// ROUTES: /api/wages (wagesRouter)
// ============================

// GET /api/wages/employee-time-summary - Admin wages view
wagesRouter.get('/employee-time-summary', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  if (userRole !== 'admin' && userRole !== 'Admin') {
    return res.status(403).json({ error: 'Access denied. Earn Track wages is for admins only.' });
  }
  const { startDate, endDate } = req.query;
  const today = new Date().toISOString().split('T')[0];
  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : String(s || '').trim());
  const start = norm(startDate || today);
  const end = norm(endDate || today);
  if (!start || !end) {
    return res.status(400).json({ error: 'startDate and endDate (YYYY-MM-DD) are required' });
  }
  let startD = start;
  let endD = end;
  if (endD < startD) [startD, endD] = [endD, startD];

  const apiKey = process.env.TEAMLOGGER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Team Logger API is not configured. Set TEAMLOGGER_API_KEY environment variable.' });
  }

  const { startMs, endMs } = getEpochMsForRange(startD, endD);

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
      return res.status(502).json({ error: 'Idle data service returned an error', message: msg || `HTTP ${response.status}`, status: response.status });
    }

    const responseData = response.data;
    const rows = Array.isArray(responseData) ? responseData : (Array.isArray(responseData?.data) ? responseData.data : []);

    const getTotalHours = (row) => {
      if (!row || typeof row !== 'object') return null;
      const hourKeys = ['totalHours', 'total_hours', 'workedHours', 'worked_hours', 'hoursWorked', 'hours_worked', 'activeHours', 'active_hours'];
      for (const k of hourKeys) {
        const v = row[k];
        if (v != null && v !== '') { const num = typeof v === 'number' ? v : parseFloat(v); if (!Number.isNaN(num)) return num; }
      }
      const minKeys = ['totalMinutes', 'total_minutes', 'workedMinutes', 'worked_minutes', 'minutesWorked', 'minutes_worked'];
      for (const k of minKeys) {
        const v = row[k];
        if (v != null && v !== '') { const num = typeof v === 'number' ? v : parseFloat(v); if (!Number.isNaN(num)) return num / 60; }
      }
      const secKeys = ['totalSeconds', 'total_seconds', 'workedSeconds', 'worked_seconds'];
      for (const k of secKeys) {
        const v = row[k];
        if (v != null && v !== '') { const num = typeof v === 'number' ? v : parseFloat(v); if (!Number.isNaN(num)) return num / 3600; }
      }
      return null;
    };

    const employeeKey = (row) => {
      const name = (row.title ?? row.name ?? row.employeeName ?? '').toString().trim();
      const email = (row.email ?? '').toString().trim();
      const code = (row.code ?? row.employeeCode ?? '').toString().trim();
      return (email || name || code || 'unknown').toLowerCase();
    };

    const aggregated = {};
    rows.forEach((row) => {
      const key = employeeKey(row);
      const idleH = getIdleHours(row);
      const totalH = getTotalHours(row);
      if (!aggregated[key]) {
        aggregated[key] = {
          employeeName: (row.title ?? row.name ?? row.employeeName ?? '').toString().trim(),
          email: (row.email ?? '').toString().trim(),
          employeeCode: (row.code ?? row.employeeCode ?? '').toString().trim(),
          idleHours: 0,
          totalHours: null
        };
      }
      aggregated[key].idleHours += idleH;
      if (totalH != null) aggregated[key].totalHours = (aggregated[key].totalHours ?? 0) + totalH;
    });

    const list = Object.values(aggregated).map((agg) => {
      const totalH = agg.totalHours != null ? agg.totalHours : null;
      const activeH = totalH != null ? Math.max(0, totalH - agg.idleHours) : null;
      return {
        employeeName: agg.employeeName,
        email: agg.email,
        employeeCode: agg.employeeCode,
        idleHours: Number(Number(agg.idleHours).toFixed(2)),
        totalHours: totalH != null ? Number(Number(totalH).toFixed(2)) : null,
        activeHours: activeH != null ? Number(Number(activeH).toFixed(2)) : null,
        dateRange: `${startD} to ${endD}`
      };
    });

    res.json(list);
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('Wages employee-time-summary error:', msg || err);
    res.status(500).json({ error: 'Failed to fetch employee time summary', message: msg || 'Unknown error' });
  }
});

// ============================
// ROUTES: /api/notifications (notificationsRouter)
// ============================

// GET /api/notifications/low-idle-employees
notificationsRouter.get('/low-idle-employees', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { date, startDate, endDate, maxIdleHours, minIdleHours = 3, minIdleMinutes = 0 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try { permissions = JSON.parse(userPermissions); } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('low_idle_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    return res.status(403).json({ error: 'Access denied. You do not have permission to view Low Idle notifications.', requiredPermission: 'low_idle_view' });
  }

  const apiKey = process.env.TEAMLOGGER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Team Logger API is not configured. Set TEAMLOGGER_API_KEY environment variable.' });
  }

  const today = new Date().toISOString().split('T')[0];
  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : s);
  let start = norm(startDate || date || today);
  let end = norm(endDate || date || today);
  if (end < start) [start, end] = [end, start];

  const minH = parseFloat(minIdleHours);
  const minM = parseFloat(minIdleMinutes);
  const thresholdHours = (Number.isNaN(minH) ? 3 : minH) + (Number.isNaN(minM) ? 0 : minM) / 60;
  if (thresholdHours < 0) {
    return res.status(400).json({ error: 'minIdleHours and minIdleMinutes must be non-negative' });
  }

  const { startMs, endMs } = getEpochMsForRange(start, end);

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
      return res.status(502).json({ error: 'Idle data service returned an error', message: msg || `HTTP ${response.status}`, status: response.status });
    }

    const responseData = response.data;
    const rows = Array.isArray(responseData) ? responseData : (Array.isArray(responseData?.data) ? responseData.data : []);

    let list = rows
      .filter((row) => getIdleHours(row) >= thresholdHours)
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

    // Enrich with department from DB
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
        return { ...item, department, idleSeconds: Math.round(Number(item.idleHours) * 3600) };
      });
    } catch (dbErr) {
      console.error('Low Idle: DB enrichment failed:', dbErr.message || dbErr);
      list = list.map((item) => ({ ...item, department: 'Unassigned', idleSeconds: Math.round(Number(item.idleHours) * 3600) }));
    } finally {
      if (connection) try { connection.release(); } catch (e) { /* ignore */ }
    }

    res.set('X-Low-Idle-StartDate', start);
    res.set('X-Low-Idle-EndDate', end);
    res.set('X-Low-Idle-MinHours', String(thresholdHours));
    res.set('X-Low-Idle-Count', String(list.length));

    // Upsert idle accountability for single-day requests
    try {
      if (start === end && list.length > 0) {
        const thresholdMinutesForAccount = (Number.isNaN(minH) ? 0 : minH * 60) + (Number.isNaN(minM) ? 0 : minM);
        await upsertIdleAccountabilityFromListForDate(list, start, thresholdMinutesForAccount > 0 ? thresholdMinutesForAccount : 20);
      }
    } catch (e) {
      console.error('Idle accountability upsert from low-idle route failed:', e.message || e);
    }

    res.json(list);
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('Error fetching Low Idle:', status || 'no-status', msg);
    res.status(status === 401 ? 502 : 500).json({
      error: 'Failed to fetch idle data from tracking app',
      message: msg || 'Unknown error'
    });
  }
});

// GET /api/notifications/currently-idle-employees
notificationsRouter.get('/currently-idle-employees', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { windowMinutes = 15, minIdleMinutes = 1 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }
  let permissions;
  try { permissions = JSON.parse(userPermissions); } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }
  if (!permissions.includes('low_idle_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    return res.status(403).json({ error: 'Access denied. You do not have permission to view idle notifications.', requiredPermission: 'low_idle_view' });
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
      return res.status(502).json({ error: 'Idle data service returned an error', message: msg || `HTTP ${response.status}`, status: response.status });
    }

    const responseData = response.data;
    const rows = Array.isArray(responseData) ? responseData : (Array.isArray(responseData?.data) ? responseData.data : []);

    let list = rows
      .filter((row) => getIdleHours(row) >= thresholdHours)
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

    // Enrich with department
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
        return { ...item, department, idleSeconds: Math.round(Number(item.idleHours) * 3600) };
      });
    } catch (dbErr) {
      console.error('Currently Idle: DB enrichment failed:', dbErr.message || dbErr);
      list = list.map((item) => ({ ...item, department: 'Unassigned', idleSeconds: Math.round(Number(item.idleHours) * 3600) }));
    } finally {
      if (connection) try { connection.release(); } catch (e) { /* ignore */ }
    }

    res.set('X-Currently-Idle-WindowMinutes', String(winM));
    res.set('X-Currently-Idle-Count', String(list.length));
    res.json(list);
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error('Error fetching Currently Idle:', status || 'no-status', msg);
    res.status(status === 401 ? 502 : 500).json({
      error: 'Failed to fetch currently idle data',
      message: msg || 'Unknown error'
    });
  }
});

// ============================
// SCHEDULED TASKS (run on module load)
// ============================

// Daily idle accountability sync (Pakistan time)
(function setupDailyIdleAccountability() {
  const timeZone = 'Asia/Karachi';
  const getYmd = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let lastYmd = getYmd();

  const runForYesterday = async () => {
    try {
      const result = await runIdleAccountabilityForDate();
      console.log('Daily idle accountability sync ran automatically:', result);
    } catch (e) {
      console.error('Daily idle accountability sync failed:', e);
    }
  };

  runForYesterday();

  setInterval(() => {
    try {
      const current = getYmd();
      if (current !== lastYmd) {
        runForYesterday();
        lastYmd = current;
      }
    } catch (e) {
      console.error('Idle accountability daily scheduler error:', e);
    }
  }, 60 * 1000);
})();

// Daily reset of recurring tasks (Pakistan time)
(function setupDailyRecurringTaskReset() {
  const timeZone = 'Asia/Karachi';
  const getYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let lastYmd = getYmd();

  const resetTasks = async () => {
    await resetRecurringTasks((err, changes) => {
      if (err) {
        console.error('Recurring task daily reset failed:', err);
      } else {
        console.log(`Recurring tasks reset to Pending for new PK date. Rows affected: ${changes}`);
      }
    });
  };

  setInterval(() => {
    try {
      const current = getYmd();
      if (current !== lastYmd) {
        resetTasks();
        lastYmd = current;
      }
    } catch (e) {
      console.error('Recurring reset scheduler error:', e);
    }
  }, 60 * 1000);
})();

// ============================
// EXPORTS
// ============================
module.exports = router;
module.exports.adminRouter = adminRouter;
module.exports.wagesRouter = wagesRouter;
module.exports.notificationsRouter = notificationsRouter;
module.exports.createIdleTicketsForDate = createIdleTicketsForDate;
module.exports.runIdleAccountabilityForDate = runIdleAccountabilityForDate;
