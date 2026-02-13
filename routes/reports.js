const router = require('express').Router();
const { mysqlPool } = require('../config/database');

// GET /api/reports/dwm - Daily/Weekly/Monthly task completion statistics
router.get('/dwm', async (req, res) => {
  const { startDate, endDate, department, employee } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Get all completed tasks from task_history
    let completedQuery = `
      SELECT 
        t.id,
        t.title,
        t.labels,
        t.status,
        th.created_at as completed_date
      FROM task_history th
      JOIN tasks t ON th.task_id = t.id
      WHERE th.action = 'Status changed'
        AND th.new_value = 'Completed'
    `;

    const completedParams = [];
    if (department) {
      completedQuery += ' AND t.department = ?';
      completedParams.push(department);
    }
    if (employee) {
      completedQuery += ' AND t.assigned_to LIKE ?';
      completedParams.push(`%${employee}%`);
    }

    // Get total tasks count (all tasks, not just completed)
    let totalQuery = `
      SELECT 
        COUNT(CASE WHEN LOWER(t.labels) LIKE '%daily%' THEN 1 END) as daily_total,
        COUNT(CASE WHEN LOWER(t.labels) LIKE '%weekly%' THEN 1 END) as weekly_total,
        COUNT(CASE WHEN LOWER(t.labels) LIKE '%monthly%' THEN 1 END) as monthly_total
      FROM tasks t
      WHERE 1=1
    `;

    const totalParams = [];
    if (department) {
      totalQuery += ' AND t.department = ?';
      totalParams.push(department);
    }
    if (employee) {
      totalQuery += ' AND t.assigned_to LIKE ?';
      totalParams.push(`%${employee}%`);
    }

    const [completedRows] = await connection.execute(completedQuery, completedParams);
    const [totalRows] = await connection.execute(totalQuery, totalParams);

    // Get all tasks to determine which days they should appear on
    let allTasksQuery = `
      SELECT id, title, labels, status
      FROM tasks t
      WHERE 1=1
    `;
    const allTasksParams = [];
    if (department) {
      allTasksQuery += ' AND t.department = ?';
      allTasksParams.push(department);
    }
    if (employee) {
      allTasksQuery += ' AND t.assigned_to LIKE ?';
      allTasksParams.push(`%${employee}%`);
    }

    const [allTasks] = await connection.execute(allTasksQuery, allTasksParams);

    const totals = totalRows[0] || { daily_total: 0, weekly_total: 0, monthly_total: 0 };

    // Format completed dates
    const completedRowsWithDates = completedRows.map(task => {
      let taskCompletedDate;
      if (task.completed_date instanceof Date) {
        taskCompletedDate = task.completed_date.toISOString().split('T')[0];
      } else if (typeof task.completed_date === 'string') {
        const date = new Date(task.completed_date);
        taskCompletedDate = date.toISOString().split('T')[0];
      } else {
        taskCompletedDate = task.completed_date;
      }

      return {
        ...task,
        completed_date_formatted: taskCompletedDate
      };
    });

    // Generate data for each day in the range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayIso = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay(); // 0 = Sunday
      // Skip Sunday
      if (dayOfWeek === 0) continue;
      const dayOfMonth = d.getDate();

      // Filter tasks completed on this specific day
      const completedOnThisDay = completedRowsWithDates.filter(task => {
        if (!task.completed_date_formatted) return false;
        return task.completed_date_formatted === dayIso;
      });

      // Deduplicate tasks on this day
      const uniqueCompletedTasksOnDay = new Map();
      completedOnThisDay.forEach(task => {
        if (!uniqueCompletedTasksOnDay.has(task.id)) {
          uniqueCompletedTasksOnDay.set(task.id, task);
        }
      });
      const uniqueCompletedOnThisDay = Array.from(uniqueCompletedTasksOnDay.values());

      // Daily tasks completed on this day
      const dailyCompleted = uniqueCompletedOnThisDay.filter(task =>
        task.labels && task.labels.toLowerCase().includes('daily')
      ).length;

      // Weekly tasks - only count on their specific day
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDayName = dayNames[dayOfWeek];

      const weeklyCompleted = uniqueCompletedOnThisDay.filter(task =>
        task.labels && task.labels.toLowerCase().includes('weekly') &&
        task.title && task.title.toLowerCase().includes(currentDayName)
      ).length;

      // Monthly tasks - only count on their specific day
      const monthlyCompleted = uniqueCompletedOnThisDay.filter(task =>
        task.labels && task.labels.toLowerCase().includes('monthly') &&
        task.title && task.title.toLowerCase().includes(`${dayOfMonth} of month`)
      ).length;

      // Calculate totals for this specific day
      const dailyTotal = totals.daily_total;

      const weeklyTotal = allTasks.filter(task =>
        task.labels && task.labels.toLowerCase().includes('weekly') &&
        task.title && task.title.toLowerCase().includes(currentDayName)
      ).length;

      const monthlyTotal = allTasks.filter(task =>
        task.labels && task.labels.toLowerCase().includes('monthly') &&
        task.title && task.title.toLowerCase().includes(`${dayOfMonth} of month`)
      ).length;

      days.push({
        day: dayIso,
        daily_completed: dailyCompleted,
        weekly_completed: weeklyCompleted,
        monthly_completed: monthlyCompleted,
        daily_total: dailyTotal,
        weekly_total: weeklyTotal,
        monthly_total: monthlyTotal
      });
    }

    res.json(days);
  } catch (err) {
    console.error('Error fetching DWM report:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/reports/dwm/details - DWM drill-down: list tasks for a given day/category
router.get('/dwm/details', async (req, res) => {
  const { date, category, department, employee, completed } = req.query;
  if (!date || !category) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) and category (daily|weekly|monthly) are required' });
  }
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const params = [date];
    let categoryWhere = '';
    if (category === 'daily') {
      categoryWhere = " AND lower(IFNULL(t.labels,'')) LIKE '%daily%'";
    } else if (category === 'weekly') {
      const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      categoryWhere = ' AND t.title LIKE ?';
      params.push(`%(${dayName})%`);
    } else if (category === 'monthly') {
      const dom = new Date(date + 'T00:00:00').getDate();
      categoryWhere = ' AND lower(t.title) LIKE ?';
      params.push(`%(${dom} of month)%`);
    } else {
      return res.status(400).json({ error: 'Invalid category' });
    }

    let filterWhere = '';
    if (department) { filterWhere += ' AND t.department = ?'; params.push(department); }
    if (employee) { filterWhere += " AND IFNULL(t.assigned_to,'') LIKE ?"; params.push(`%${employee}%`); }

    const wantCompleted = String(completed).toLowerCase() === 'true';

    if (wantCompleted) {
      const q = `
        SELECT t.id, t.title, t.status, t.labels, t.priority,
               COALESCE(SUM(CASE WHEN date(ts.start_time) = ? THEN ABS(IFNULL(ts.hours_logged, 0)) ELSE 0 END), 0) AS seconds
        FROM task_history th
        JOIN tasks t ON t.id = th.task_id
        LEFT JOIN task_timesheet ts ON ts.task_id = t.id
        WHERE th.action = 'Status changed'
          AND th.new_value = 'Completed'
          AND date(th.created_at) = ?
          ${categoryWhere}
          ${filterWhere}
        GROUP BY t.id, t.title, t.status
        ORDER BY t.title
      `;
      const execParams = [date, date, ...params.slice(1)];
      const [rows] = await connection.execute(q, execParams);
      const totalSeconds = rows.reduce((s, r) => s + (r.seconds || 0), 0);
      res.json({ items: rows, totalSeconds });
    } else {
      const candidatesQ = `
        SELECT t.id, t.title, t.status, t.labels, t.priority
        FROM tasks t
        WHERE 1=1 ${categoryWhere} ${filterWhere}
      `;
      const [candidateTasks] = await connection.execute(candidatesQ, params.slice(1));

      if (candidateTasks.length === 0) return res.json({ items: [], totalSeconds: 0 });

      const ids = candidateTasks.map(t => t.id);
      const placeholders = ids.map(() => '?').join(',');
      const completedQ = `
        SELECT DISTINCT task_id FROM task_history
        WHERE action = 'Status changed' AND new_value = 'Completed' AND date(created_at) = ?
          AND task_id IN (${placeholders})
      `;
      const [compRows] = await connection.execute(completedQ, [date, ...ids]);

      const compSet = new Set(compRows.map(r => r.task_id));
      const items = candidateTasks.filter(t => !compSet.has(t.id));
      res.json({ items, totalSeconds: 0 });
    }
  } catch (err) {
    console.error('Error in DWM report details:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/reports/timelog - Time tracking data grouped by day
router.get('/timelog', async (req, res) => {
  const { start, end, employee, department } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });

  const params = [];
  let where = `tt.start_time >= ? AND tt.start_time <= ?`;
  const startDate = `${start} 00:00:00`;
  const endDate = `${end} 23:59:59`;
  params.push(startDate, endDate);

  if (employee) {
    where += ` AND tt.employee_name = ?`;
    params.push(employee);
  }
  if (department) {
    where += ` AND t.department = ?`;
    params.push(department);
  }

  const query = `
    SELECT tt.employee_name, t.title AS task_title, t.labels, t.priority,
           DATE_FORMAT(tt.start_time, '%Y-%m-%d') as log_date,
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
           ) as seconds
    FROM task_timesheet tt
    LEFT JOIN tasks t ON t.id = tt.task_id
    WHERE ${where}
    GROUP BY tt.employee_name, t.title, t.labels, t.priority, log_date
    ORDER BY log_date ASC
  `;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query, params);
    const totalSeconds = rows.reduce((s, r) => s + parseInt(r.seconds || 0, 10), 0);
    res.json({ items: rows, totalSeconds });
  } catch (err) {
    console.error('TimeLog query error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/reports/timelog/consolidated - Consolidated time log grouped by task & assignee
router.get('/timelog/consolidated', async (req, res) => {
  const { start, end, employee, department } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });

  const params = [];
  let where = `tt.start_time >= ? AND tt.start_time <= ?`;
  const startDate = `${start} 00:00:00`;
  const endDate = `${end} 23:59:59`;
  params.push(startDate, endDate);

  if (employee) {
    where += ` AND tt.employee_name = ?`;
    params.push(employee);
  }
  if (department) {
    where += ` AND t.department = ?`;
    params.push(department);
  }

  const query = `
    SELECT 
      tt.employee_name,
      t.title AS task_title,
      t.labels,
      t.priority,
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
      ) as seconds
    FROM task_timesheet tt
    LEFT JOIN tasks t ON t.id = tt.task_id
    WHERE ${where}
    GROUP BY tt.employee_name, t.title, t.labels, t.priority
    ORDER BY seconds DESC
  `;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query, params);
    const totalSeconds = rows.reduce((s, r) => s + parseInt(r.seconds || 0, 10), 0);
    res.json({ items: rows, totalSeconds });
  } catch (err) {
    console.error('Consolidated TimeLog query error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
