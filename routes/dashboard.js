const router = require('express').Router();
const { mysqlPool } = require('../config/database');

// Dashboard API endpoint
router.get('/', async (req, res) => {
  try {
    let connection;

    // Get a connection from the pool
    connection = await mysqlPool.getConnection();

    // Check connection health
    await connection.ping();

    // Get counts for various entities
    const [employees] = await connection.execute('SELECT COUNT(*) as count FROM employees WHERE status = "Active"');
    const [tasks] = await connection.execute('SELECT COUNT(*) as count FROM tasks');
    const [completedTasks] = await connection.execute('SELECT COUNT(*) as count FROM tasks WHERE status = "Completed"');
    const [pendingTasks] = await connection.execute('SELECT COUNT(*) as count FROM tasks WHERE status = "Pending"');
    const [inProgressTasks] = await connection.execute('SELECT COUNT(*) as count FROM tasks WHERE status = "In Progress"');
    const [overdueTasks] = await connection.execute('SELECT COUNT(*) as count FROM tasks WHERE due_date < CURDATE() AND status != "Completed"');
    const [departments] = await connection.execute('SELECT COUNT(*) as count FROM departments');
    const [designations] = await connection.execute('SELECT COUNT(*) as count FROM designations');
    const [notices] = await connection.execute('SELECT COUNT(*) as count FROM notices');

    // Get recent tasks (last 5)
    const [recentTasks] = await connection.execute(`
      SELECT id, title, status, department, priority, created_at 
      FROM tasks 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    // Get recent employees (last 5)
    const [recentEmployees] = await connection.execute(`
      SELECT id, name, department, designation, created_at 
      FROM employees 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    // Calculate task completion percentage
    const totalTasks = tasks[0].count || 0;
    const completedTaskCount = completedTasks[0].count || 0;
    const completionPercentage = totalTasks > 0 ? Math.round((completedTaskCount / totalTasks) * 100) : 0;

    // Get recent activities (last 10 task history entries)
    const [recentActivities] = await connection.execute(`
      SELECT th.*, t.title as task_title, e.name as employee_name
      FROM task_history th
      LEFT JOIN tasks t ON th.task_id = t.id
      LEFT JOIN employees e ON th.user_id = e.id
      ORDER BY th.created_at DESC
      LIMIT 10
    `);

    const dashboardData = {
      totalEmployees: employees[0].count || 0,
      totalTasks: totalTasks,
      completedTasks: completedTaskCount,
      pendingTasks: pendingTasks[0].count || 0,
      inProgressTasks: inProgressTasks[0].count || 0,
      overdueTasks: overdueTasks[0].count || 0,
      completionPercentage: completionPercentage,
      totalDepartments: departments[0].count || 0,
      totalDesignations: designations[0].count || 0,
      totalNotices: notices[0].count || 0,
      recentTasks,
      recentEmployees,
      recentActivities: recentActivities.map(activity => ({
        id: activity.id,
        taskId: activity.task_id,
        taskTitle: activity.task_title || 'N/A',
        action: activity.action,
        description: activity.description,
        employeeName: activity.employee_name || 'System',
        createdAt: activity.created_at
      }))
    };

    res.json(dashboardData);
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;