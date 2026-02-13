const router = require('express').Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { mysqlPool } = require('../config/database');
const { formatAttendanceDate } = require('../helpers/dates');
const { logTaskHistory } = require('../helpers/taskHistory');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/attendance/status - Get current clock-in status for an employee
router.get('/status', async (req, res) => {
  const { employee_id } = req.query;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).split(' ')[0];

    const query = `SELECT * FROM attendance WHERE employee_id = ? AND date = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    const [rows] = await connection.execute(query, [employee_id, today]);

    let entry = null;

    if (rows.length > 0) {
      const row = rows[0];
      entry = {
        ...row,
        clock_in: formatAttendanceDate(row.clock_in),
        clock_out: formatAttendanceDate(row.clock_out)
      };
    }

    res.json({
      active: Boolean(entry),
      entry,
      totalDailyDuration: entry ? entry.duration_seconds || 0 : 0
    });
  } catch (err) {
    console.error('Error fetching attendance status:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/attendance/clock-in
router.post('/clock-in', async (req, res) => {
  const { employee_id, when } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const nowISO = when || new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T');
    const now = nowISO.replace('T', ' ');
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).split(' ')[0];

    const [employeeRows] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employeeRows.length === 0) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    const employeeName = employeeRows[0].name;

    const [existingRows] = await connection.execute(
      'SELECT id FROM attendance WHERE employee_id = ? AND date = ? AND clock_out IS NULL',
      [employee_id, today]
    );
    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'Already clocked in for today' });
    }

    const [todayRecord] = await connection.execute(
      'SELECT id, session_count, duration_seconds FROM attendance WHERE employee_id = ? AND date = ? ORDER BY id DESC LIMIT 1',
      [employee_id, today]
    );

    if (todayRecord.length > 0) {
      const currentSessionCount = todayRecord[0].session_count || 1;
      await connection.execute(
        'UPDATE attendance SET session_count = ?, clock_in = ?, clock_out = NULL WHERE id = ?',
        [currentSessionCount + 1, now, todayRecord[0].id]
      );
      res.status(200).json({
        id: todayRecord[0].id,
        employee_id,
        employee_name: employeeName,
        date: today,
        clock_in: formatAttendanceDate(nowISO),
        session_count: currentSessionCount + 1
      });
    } else {
      const [result] = await connection.execute(
        'INSERT INTO attendance (employee_id, employee_name, date, clock_in, session_count) VALUES (?, ?, ?, ?, 1)',
        [employee_id, employeeName, today, now]
      );
      res.status(201).json({
        id: result.insertId,
        employee_id,
        employee_name: employeeName,
        date: today,
        clock_in: formatAttendanceDate(nowISO),
        session_count: 1
      });
    }
  } catch (err) {
    console.error('Error clocking in:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/attendance/clock-out
router.post('/clock-out', async (req, res) => {
  const { employee_id, when } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const nowISO = when || new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T');
    const now = nowISO.replace('T', ' ');
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).split(' ')[0];

    const [rows] = await connection.execute(
      'SELECT id, clock_in, session_count, duration_seconds FROM attendance WHERE employee_id = ? AND date = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
      [employee_id, today]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Not clocked in for today' });
    }

    const row = rows[0];

    const normalizeToDate = (value) => {
      if (!value) return null;
      if (value instanceof Date) return value;
      const strValue = String(value).trim();
      if (!strValue) return null;
      if (strValue.includes('T')) return new Date(strValue);
      if (strValue.includes(' ')) {
        const [datePart, timePart] = strValue.split(' ');
        return new Date(`${datePart}T${timePart}`);
      }
      return new Date(`${today}T${strValue}`);
    };

    const clockInTime = normalizeToDate(row.clock_in);
    const nowDate = normalizeToDate(nowISO);
    const nowForDb = now;

    const currentSessionDuration = Math.max(0, Math.floor(((nowDate || new Date()) - (clockInTime || new Date())) / 1000));

    const previousDuration = row.duration_seconds || 0;
    const totalDurationSeconds = previousDuration + currentSessionDuration;
    const totalHoursWorked = Number((totalDurationSeconds / 3600).toFixed(4));

    await connection.execute(
      'UPDATE attendance SET clock_out = ?, duration_seconds = ?, hours_worked = ? WHERE id = ?',
      [nowForDb, totalDurationSeconds, totalHoursWorked, row.id]
    );

    // Auto-stop any running task timer for this employee
    const stoppedTimerTaskIds = [];
    const stoppedTimers = [];
    try {
      const empIdInt = parseInt(employee_id, 10);
      if (!isNaN(empIdInt)) {
        const [empRows] = await connection.execute('SELECT name FROM employees WHERE id = ?', [empIdInt]);
        const employeeName = empRows.length ? (empRows[0].name || '').trim() : null;
        if (employeeName) {
          const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
          const empNorm = norm(employeeName);
          const [tasksWithTimer] = await connection.execute(
            `SELECT id, CAST(timer_started_at AS CHAR) AS timer_started_at, COALESCE(logged_seconds, 0) AS logged_seconds FROM tasks 
             WHERE timer_started_at IS NOT NULL 
             AND (LOWER(CONCAT(',', TRIM(REPLACE(COALESCE(assigned_to,''), ' ', '')), ',')) LIKE CONCAT('%,', ?, ',%') 
                  OR LOWER(TRIM(REPLACE(COALESCE(assigned_to,''), ' ', ''))) = ?
                  OR LOWER(assigned_to) LIKE CONCAT(?, '%') 
                  OR LOWER(assigned_to) LIKE CONCAT('%,', ?))`,
            [empNorm, empNorm, empNorm, empNorm]
          );
          const formatForMySQL = (date) => {
            return date.toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' });
          };
          const parseTimerStartedAt = (val) => {
            const str = String(val || '').trim().replace(' ', 'T');
            if (!str) return new Date();
            return new Date(str.includes('+') || str.endsWith('Z') ? str : str + '+05:00');
          };
          for (const t of tasksWithTimer) {
            const startTime = parseTimerStartedAt(t.timer_started_at);
            const endTime = new Date();
            let finalLoggedSeconds = Math.floor((endTime - startTime) / 1000);
            if (finalLoggedSeconds < 0) {
              console.warn('Clock-out timer: negative duration for task', t.id, '- using server-local parse as fallback');
              const fallbackStart = new Date(String(t.timer_started_at).replace(' ', 'T'));
              finalLoggedSeconds = Math.max(0, Math.floor((endTime - fallbackStart) / 1000));
            }
            finalLoggedSeconds = Math.max(0, finalLoggedSeconds);
            const previousLogged = Number(t.logged_seconds) || 0;
            const newLoggedSeconds = previousLogged + finalLoggedSeconds;
            await connection.execute(
              'UPDATE tasks SET timer_started_at = NULL, logged_seconds = COALESCE(logged_seconds,0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [finalLoggedSeconds, t.id]
            );
            await connection.execute(
              `INSERT INTO task_timesheet (task_id, employee_name, employee_id, start_time, end_time, memo, hours_logged, hours_logged_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [t.id, employeeName, empIdInt, formatForMySQL(startTime), formatForMySQL(endTime), 'Employee clocked out', finalLoggedSeconds, finalLoggedSeconds]
            );
            await logTaskHistory(t.id, 'Timer stopped', `Timer stopped (Employee clocked out). Logged ${Math.floor(finalLoggedSeconds / 3600)}h ${Math.floor((finalLoggedSeconds % 3600) / 60)}m. Memo: Employee clocked out`, employeeName, empIdInt);
            stoppedTimerTaskIds.push(t.id);
            stoppedTimers.push({ task_id: t.id, logged_seconds: newLoggedSeconds });
          }
        }
      }
    } catch (timerErr) {
      console.error('Error auto-stopping task timer on clock-out:', timerErr);
    }

    res.json({
      id: row.id,
      employee_id,
      clock_in: formatAttendanceDate(clockInTime || row.clock_in),
      clock_out: formatAttendanceDate(nowDate || nowISO),
      duration_seconds: totalDurationSeconds,
      hours_worked: totalHoursWorked,
      session_count: row.session_count || 1,
      stopped_timer_task_ids: stoppedTimerTaskIds,
      stopped_timers: stoppedTimers
    });
  } catch (err) {
    console.error('Error clocking out:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/attendance/summary - Attendance summary (date-range or monthly)
router.get('/summary', async (req, res) => {
  const { employee_id, from_date, to_date, exclude_imported } = req.query;

  // Date-range logic
  if (from_date && to_date) {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();

      const workingDaysQuery = `
        WITH RECURSIVE dates(date) AS (
          SELECT ? as date
          UNION ALL
            SELECT DATE_ADD(date, INTERVAL 1 DAY)
          FROM dates
          WHERE date <= ?
        )
        SELECT COUNT(*) as total_working_days
        FROM dates
          WHERE DAYOFWEEK(date) NOT IN (1, 7)
        `;

      const [workingDaysResult] = await connection.execute(workingDaysQuery, [from_date, to_date]);
      const totalWorkingDays = workingDaysResult[0].total_working_days || 0;

      let attendanceQuery = `
        SELECT 
          COUNT(DISTINCT a.date) as total_days,
          SUM(a.hours_worked) as total_hours,
          SUM(a.duration_seconds) as total_seconds
        FROM attendance a 
        WHERE a.date >= ? AND a.date <= ?
      `;
      const attendanceParams = [from_date, to_date];

      if (employee_id) {
        attendanceQuery += ' AND a.employee_id = ?';
        attendanceParams.push(employee_id);
      }
      if (exclude_imported === 'true') {
        attendanceQuery += ' AND (a.is_imported = 0 OR a.is_imported IS NULL)';
      }

      const [attendanceResult] = await connection.execute(attendanceQuery, attendanceParams);
      const attendanceRow = attendanceResult[0];

      const totalDays = attendanceRow.total_days || 0;
      const totalHours = attendanceRow.total_hours || 0;
      const absentees = Math.max(0, totalWorkingDays - totalDays);

      const summary = {
        total_days: totalDays,
        total_hours: totalHours,
        total_seconds: attendanceRow.total_seconds || 0,
        absentees: absentees,
        total_working_days: totalWorkingDays
      };

      res.json(summary);
    } catch (err) {
      console.error('Error fetching attendance summary:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
    return;
  }

  // Monthly summary fallback
  const { month, year } = req.query;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const now = new Date();
    const useMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
    const useYear = year ? parseInt(year, 10) : now.getFullYear();
    const start = new Date(useYear, useMonth - 1, 1).toISOString();
    const end = new Date(useYear, useMonth, 1).toISOString();

    const query = `SELECT * FROM attendance WHERE employee_id = ? AND clock_in >= ? AND clock_in < ? ORDER BY clock_in DESC`;
    const [rows] = await connection.execute(query, [employee_id, start, end]);

    const totalSeconds = rows.reduce((s, r) => s + (r.duration_seconds || 0), 0);
    res.json({ total_seconds: totalSeconds, entries: rows });
  } catch (err) {
    console.error('Error fetching attendance summary:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/attendance/add - Add manual attendance record
router.post('/add', async (req, res) => {
  const { employee_id, date, clock_in, clock_out, hours_worked } = req.body;

  if (!employee_id || !date || !clock_in) {
    return res.status(400).json({ error: 'employee_id, date, and clock_in are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [employees] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employee_name = employees[0].name;
    let durationSeconds = 0;

    if (clock_out) {
      const clockInTime = new Date(`${date}T${clock_in}`);
      const clockOutTime = new Date(`${date}T${clock_out}`);
      durationSeconds = Math.max(0, Math.floor((clockOutTime - clockInTime) / 1000));
    }

    const finalHoursWorked = hours_worked || (durationSeconds / 3600);

    const insert = `
      INSERT INTO attendance (employee_id, employee_name, date, clock_in, clock_out, duration_seconds, hours_worked) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await connection.execute(insert, [employee_id, employee_name, date, clock_in, clock_out || null, durationSeconds, finalHoursWorked]);

    res.status(201).json({
      id: result.insertId,
      employee_id,
      employee_name,
      date,
      clock_in,
      clock_out,
      duration_seconds: durationSeconds,
      hours_worked: finalHoursWorked,
      message: 'Attendance record added successfully'
    });
  } catch (err) {
    console.error('Error adding attendance record:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/attendance/:id - Update attendance record
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { date, clock_in, clock_out, hours_worked } = req.body;

  if (!date || !clock_in) {
    return res.status(400).json({ error: 'date and clock_in are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    let durationSeconds = 0;

    if (clock_out) {
      const clockInTime = new Date(`${date}T${clock_in}`);
      const clockOutTime = new Date(`${date}T${clock_out}`);
      durationSeconds = Math.max(0, Math.floor((clockOutTime - clockInTime) / 1000));
    }

    const finalHoursWorked = hours_worked || (durationSeconds / 3600);

    const update = `
      UPDATE attendance 
      SET date = ?, clock_in = ?, clock_out = ?, duration_seconds = ?, hours_worked = ?
      WHERE id = ?
    `;

    const [result] = await connection.execute(update, [date, clock_in, clock_out || null, durationSeconds, finalHoursWorked, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    res.json({
      id,
      date,
      clock_in,
      clock_out,
      duration_seconds: durationSeconds,
      hours_worked: finalHoursWorked,
      message: 'Attendance record updated successfully'
    });
  } catch (err) {
    console.error('Error updating attendance record:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/attendance/clear-all - Clear ALL attendance data (MUST come before /:id)
router.delete('/clear-all', async (req, res) => {
  if (!req.headers['x-confirm-clear-all']) {
    return res.status(400).json({
      error: 'Missing confirmation header. This operation requires explicit confirmation.'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM attendance');
    const totalRecords = countResult[0].total;

    if (totalRecords === 0) {
      return res.json({ message: 'No attendance records found to delete', deletedCount: 0 });
    }

    await connection.execute('DELETE FROM attendance');

    res.json({
      message: `Successfully cleared all ${totalRecords} attendance records from the database`,
      deletedCount: totalRecords
    });
  } catch (err) {
    console.error('Error clearing all attendance data:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/attendance/bulk - Bulk delete (MUST come before /:id)
router.delete('/bulk', async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs array is required' });
  }

  const numericIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));

  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const placeholders = numericIds.map(() => '?').join(',');
    const checkQuery = `SELECT id FROM attendance WHERE id IN (${placeholders})`;

    const [existingRecords] = await connection.execute(checkQuery, numericIds);

    const existingIds = existingRecords.map(record => record.id);

    if (existingIds.length === 0) {
      return res.status(404).json({ error: 'No attendance records found with the provided IDs' });
    }

    const deletePlaceholders = existingIds.map(() => '?').join(',');
    const deleteQuery = `DELETE FROM attendance WHERE id IN (${deletePlaceholders})`;

    const [result] = await connection.execute(deleteQuery, existingIds);
    res.json({
      message: `${result.affectedRows} attendance record(s) deleted successfully`,
      deletedCount: result.affectedRows
    });
  } catch (err) {
    console.error('Error deleting attendance records:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/attendance/:id - Delete single record (MUST come after specific routes)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [result] = await connection.execute('DELETE FROM attendance WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (err) {
    console.error('Error deleting attendance:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/attendance/records - Get all records with filters
router.get('/records', async (req, res) => {
  const { employee_id, from_date, to_date, start_date, end_date, exclude_imported } = req.query;

  let where = '1=1';
  const params = [];

  if (employee_id) {
    where += ' AND employee_id = ?';
    params.push(employee_id);
  }

  const dateFrom = from_date || start_date;
  const dateTo = to_date || end_date;

  if (dateFrom) {
    where += ' AND date >= ?';
    params.push(dateFrom);
  }

  if (dateTo) {
    where += ' AND date <= ?';
    params.push(dateTo);
  }

  if (exclude_imported === 'true') {
    where += ' AND (is_imported = 0 OR is_imported IS NULL)';
  }

  const query = `
    SELECT id, employee_id, employee_name, date, clock_in, clock_out, duration_seconds, hours_worked, session_count, created_at
    FROM attendance 
    WHERE ${where}
    ORDER BY date DESC, clock_in DESC
  `;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Ensure session_count column exists
    try {
      await connection.execute('ALTER TABLE attendance ADD COLUMN session_count INT DEFAULT 1');
    } catch (err) {
      // Column already exists, ignore error
    }

    const [rows] = await connection.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching attendance records:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/attendance/debug - Debug endpoint
router.get('/debug', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = 'SELECT id, employee_name, date, clock_in, clock_out FROM attendance ORDER BY id DESC LIMIT 10';
    const [rows] = await connection.execute(query);

    res.json({
      totalRecords: rows.length,
      records: rows
    });
  } catch (err) {
    console.error('Error fetching attendance debug data:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/attendance/test-clear-all - Test route accessibility
router.get('/test-clear-all', (req, res) => {
  res.json({
    message: 'Clear-all route is accessible',
    route: '/api/attendance/clear-all',
    method: 'DELETE',
    requiredHeader: 'x-confirm-clear-all: true'
  });
});

// POST /api/attendance/import - Import attendance from Excel
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length < 2) {
      return res.status(400).json({ error: 'File must contain at least a header row and one data row' });
    }

    const headers = data[0];
    const rows = data.slice(1);

    const employeeNameIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('employee'));
    const dateIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('date'));
    const clockInIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('clock in'));
    const clockOutIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('clock out'));

    if (employeeNameIndex === -1 || dateIndex === -1 || clockInIndex === -1) {
      return res.status(400).json({
        error: 'File must contain columns: Employee Name, Date, Clock In (Clock Out is optional)'
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => !cell)) continue;

      try {
        const employeeName = row[employeeNameIndex];
        const date = row[dateIndex];
        const clockIn = row[clockInIndex];
        const clockOut = row[clockOutIndex] || null;

        if (!employeeName || !date || !clockIn) {
          errors.push(`Row ${i + 2}: Missing required fields (Employee Name, Date, or Clock In)`);
          errorCount++;
          continue;
        }

        const [employees] = await connection.execute('SELECT id, name FROM employees WHERE LOWER(name) = LOWER(?)', [employeeName]);
        const employee = employees[0];

        if (!employee) {
          errors.push(`Row ${i + 2}: Employee "${employeeName}" not found`);
          errorCount++;
          continue;
        }

        // Format date
        let formattedDate = date;
        if (date instanceof Date) {
          formattedDate = date.toISOString().split('T')[0];
        } else if (typeof date === 'string') {
          const parsedDate = new Date(date);
          if (!isNaN(parsedDate.getTime())) {
            formattedDate = parsedDate.toISOString().split('T')[0];
          }
        } else if (typeof date === 'number') {
          const excelDate = new Date((date - 25569) * 86400 * 1000);
          formattedDate = excelDate.toISOString().split('T')[0];
        }

        // Check for existing record
        const [existingRecords] = await connection.execute('SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [employee.id, formattedDate]);
        if (existingRecords.length > 0) {
          errors.push(`Row ${i + 2}: Record already exists for ${employeeName} on ${formattedDate}`);
          errorCount++;
          continue;
        }

        // Format clock in time
        let formattedClockIn = clockIn;
        if (clockIn instanceof Date) {
          formattedClockIn = clockIn.toTimeString().slice(0, 5);
        } else if (typeof clockIn === 'number') {
          const hours = Math.floor(clockIn * 24);
          const minutes = Math.floor((clockIn * 24 * 60) % 60);
          formattedClockIn = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } else if (typeof clockIn === 'string') {
          const timeMatch = clockIn.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          if (timeMatch) {
            formattedClockIn = `${String(parseInt(timeMatch[1])).padStart(2, '0')}:${String(parseInt(timeMatch[2])).padStart(2, '0')}`;
          }
        }

        // Format clock out time
        let formattedClockOut = clockOut;
        if (clockOut instanceof Date) {
          formattedClockOut = clockOut.toTimeString().slice(0, 5);
        } else if (typeof clockOut === 'number') {
          const hours = Math.floor(clockOut * 24);
          const minutes = Math.floor((clockOut * 24 * 60) % 60);
          formattedClockOut = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } else if (typeof clockOut === 'string') {
          const timeMatch = clockOut.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          if (timeMatch) {
            formattedClockOut = `${String(parseInt(timeMatch[1])).padStart(2, '0')}:${String(parseInt(timeMatch[2])).padStart(2, '0')}`;
          }
        }

        // Calculate duration
        let durationSeconds = 0;
        let finalHoursWorked = 0;

        if (formattedClockOut) {
          const clockInTime = new Date(`${formattedDate}T${formattedClockIn}`);
          const clockOutTime = new Date(`${formattedDate}T${formattedClockOut}`);
          durationSeconds = Math.max(0, Math.floor((clockOutTime - clockInTime) / 1000));
          finalHoursWorked = durationSeconds / 3600;
        } else {
          durationSeconds = 8 * 3600;
          finalHoursWorked = 8;
        }

        const insert = `
          INSERT INTO attendance (employee_id, employee_name, date, clock_in, clock_out, duration_seconds, hours_worked, is_imported) 
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `;

        await connection.execute(insert, [
          employee.id,
          employee.name,
          formattedDate,
          formattedClockIn,
          formattedClockOut,
          durationSeconds,
          finalHoursWorked
        ]);

        successCount++;
      } catch (error) {
        console.error(`Error processing row ${i + 2}:`, error);
        errors.push(`Row ${i + 2}: ${error.message}`);
        errorCount++;
      }
    }

    res.json({
      message: `Import completed. ${successCount} records imported successfully, ${errorCount} errors.`,
      successCount,
      errorCount,
      errors: errors.slice(0, 10)
    });

  } catch (error) {
    console.error('Error processing attendance import:', error);
    res.status(500).json({ error: 'Error processing file: ' + error.message });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/attendance/sample - Download sample import file
router.get('/sample', (req, res) => {
  try {
    const workbook = xlsx.utils.book_new();

    const sampleData = [
      ['Employee Name', 'Date', 'Clock In', 'Clock Out'],
      ['Junaid Arshad', '2025-05-01', '09:00', '17:00'],
      ['Junaid Arshad', '2025-05-02', '08:30', '17:30'],
      ['Junaid Arshad', '2025-05-03', '09:15', '18:15'],
      ['', '', '', ''],
      ['Instructions:', '', '', ''],
      ['1. Employee Name: Must match exactly with employee names in the system', '', '', ''],
      ['2. Date: Use YYYY-MM-DD format (e.g., 2025-05-01)', '', '', ''],
      ['3. Clock In: Use HH:MM format (e.g., 09:00)', '', '', ''],
      ['4. Clock Out: Use HH:MM format (e.g., 17:00) - Optional', '', '', ''],
      ['5. Hours will be calculated automatically from Clock In and Clock Out times', '', '', '']
    ];

    const worksheet = xlsx.utils.aoa_to_sheet(sampleData);

    worksheet['!cols'] = [
      { width: 20 },
      { width: 15 },
      { width: 12 },
      { width: 12 }
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Attendance Import');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_import_sample.xlsx');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);

  } catch (error) {
    console.error('Error generating sample file:', error);
    res.status(500).json({ error: 'Error generating sample file' });
  }
});

module.exports = router;
