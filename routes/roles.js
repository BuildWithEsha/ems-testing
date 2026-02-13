const router = require('express').Router();
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');

// GET /api/roles - List all active roles
router.get('/', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = 'SELECT * FROM roles WHERE status = "Active" ORDER BY name';
    const [results] = await connection.execute(query);
    res.json(results);
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/roles - Create a new role
router.post('/', async (req, res) => {
  let connection;
  try {
    const { name, description, permissions } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Check if role name already exists
    const [existing] = await connection.execute('SELECT id FROM roles WHERE name = ?', [name]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Role name already exists' });
    }

    const insertQuery = 'INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)';
    const [result] = await connection.execute(insertQuery, [
      sanitizeForMySQL(name),
      sanitizeForMySQL(description) || '',
      JSON.stringify(permissions || [])
    ]);

    const [newRole] = await connection.execute('SELECT * FROM roles WHERE id = ?', [result.insertId]);
    res.status(201).json(newRole[0]);
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/roles/:id - Update a role
router.put('/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [existing] = await connection.execute('SELECT id FROM roles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const [nameConflict] = await connection.execute('SELECT id FROM roles WHERE name = ? AND id != ?', [name, id]);
    if (nameConflict.length > 0) {
      return res.status(400).json({ error: 'Role name already exists' });
    }

    const updateQuery = 'UPDATE roles SET name = ?, description = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await connection.execute(updateQuery, [
      sanitizeForMySQL(name),
      sanitizeForMySQL(description) || '',
      JSON.stringify(permissions || []),
      id
    ]);

    const [updatedRole] = await connection.execute('SELECT * FROM roles WHERE id = ?', [id]);
    res.json(updatedRole[0]);
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/roles/:id - Soft delete a role
router.delete('/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [existing] = await connection.execute('SELECT id FROM roles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Check if role is assigned to any employees
    const [employeesWithRole] = await connection.execute(
      'SELECT COUNT(*) as count FROM employees WHERE user_role = (SELECT name FROM roles WHERE id = ?)',
      [id]
    );
    if (employeesWithRole[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete role. It is assigned to employees. Please reassign employees first.'
      });
    }

    await connection.execute('UPDATE roles SET status = "Inactive", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('Error deleting role:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
