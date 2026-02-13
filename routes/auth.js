const router = require('express').Router();
const { mysqlPool } = require('../config/database');

// POST /api/auth - Legacy auth endpoint
router.post('/', async (req, res) => {
  const { username, password } = req.body;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `SELECT id, name, role, permissions FROM users WHERE username = ? AND password = ?`;
    const [rows] = await connection.execute(query, [username, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      permissions: user.permissions ? JSON.parse(user.permissions) : []
    });
  } catch (err) {
    console.error('Error authenticating user:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/auth/login - Employee login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Check if it's admin login
  if (email === 'admin@daataadirect.co.uk' && password === 'Allahrasoolmuhammad') {
    return res.json({
      success: true,
      user: {
        id: 'admin',
        email: email,
        name: 'Admin User',
        role: 'admin',
        permissions: ['all']
      }
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = 'SELECT * FROM employees WHERE email = ? AND password = ? AND status = "Active"';
    const [rows] = await connection.execute(query, [email, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const employee = rows[0];

    // Fetch user permissions from roles table
    let userPermissions = [];
    if (employee.user_role) {
      try {
        const [rolePermissions] = await connection.execute(
          `SELECT permissions FROM roles WHERE name = ? AND status = 'Active'`,
          [employee.user_role]
        );

        if (rolePermissions.length > 0) {
          try {
            userPermissions = rolePermissions[0].permissions ? JSON.parse(rolePermissions[0].permissions) : [];
          } catch (e) {
            console.error('Error parsing permissions for role:', employee.user_role, e);
          }
        }
      } catch (err) {
        console.error('Error fetching role permissions:', err);
      }
    }

    res.json({
      success: true,
      user: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        role: employee.user_role || 'employee',
        employee_id: employee.employee_id,
        department: employee.department,
        designation: employee.designation,
        permissions: userPermissions
      }
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/auth/profile - Get user profile
router.get('/profile', async (req, res) => {
  const { user_id, role } = req.query;

  if (role === 'admin') {
    return res.json({
      id: 'admin',
      email: 'admin@daataadirect.co.uk',
      name: 'Admin User',
      role: 'admin'
    });
  }

  if (role === 'employee' && user_id) {
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();

      const query = 'SELECT id, employee_id, name, email, department, designation, status, role FROM employees WHERE id = ?';
      const [rows] = await connection.execute(query, [user_id]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const employee = rows[0];
      res.json({
        id: employee.id,
        email: employee.email,
        name: employee.name,
        role: employee.role || 'employee',
        employee_id: employee.employee_id,
        department: employee.department,
        designation: employee.designation
      });
    } catch (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      if (connection) connection.release();
    }
  } else {
    res.status(400).json({ error: 'Invalid request' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;

  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Email, current password, and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    if (email === 'admin@daataadirect.co.uk') {
      let adminUser = null;

      try {
        const [adminRows] = await connection.execute(
          'SELECT id, password FROM employees WHERE email = ?',
          [email]
        );
        if (adminRows.length > 0) adminUser = adminRows[0];
      } catch (dbError) {
        console.log('Database query failed for admin:', dbError.message);
      }

      if (!adminUser) {
        try {
          const [insertResult] = await connection.execute(
            'INSERT INTO employees (name, email, user_role, password, status) VALUES (?, ?, ?, ?, ?)',
            ['Admin User', email, 'Admin', 'admin123', 'Active']
          );
          adminUser = { id: insertResult.insertId, password: 'admin123' };
        } catch (insertError) {
          return res.status(500).json({ error: 'Database error - unable to create admin user' });
        }
      }

      const isCurrentPasswordValid =
        adminUser.password === currentPassword ||
        currentPassword === 'admin123' ||
        currentPassword === 'Allahrasoolmuhammad';

      if (!isCurrentPasswordValid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      await connection.execute('UPDATE employees SET password = ? WHERE email = ?', [newPassword, email]);
      res.json({ success: true, message: 'Password changed successfully' });
    } else {
      const [userRows] = await connection.execute(
        'SELECT id, password FROM employees WHERE email = ? AND status = "Active"',
        [email]
      );

      if (userRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (userRows[0].password !== currentPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      await connection.execute('UPDATE employees SET password = ? WHERE email = ?', [newPassword, email]);
      res.json({ success: true, message: 'Password changed successfully' });
    }
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
