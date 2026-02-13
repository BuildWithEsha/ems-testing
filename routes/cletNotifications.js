const router = require('express').Router();
const { mysqlPool } = require('../config/database');

// GET /api/clet-notifications - Fetch tasks missing checklist or estimated time
router.get('/', async (req, res) => {
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
