const router = require('express').Router();
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');

// GET /api/appreciations - List all appreciations
router.get('/', async (req, res) => {
  const query = `
    SELECT a.id, a.employee_id, a.employee_name, a.title, a.description, a.appreciation_date, a.created_at
    FROM appreciations a
    ORDER BY a.created_at DESC
  `;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching appreciations:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/appreciations - Create an appreciation
router.post('/', async (req, res) => {
  const { employee_id, title, description, appreciation_date } = req.body;
  if (!employee_id || !title) {
    return res.status(400).json({ error: 'employee_id and title are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [employees] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employees.length === 0) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    const employee_name = employees[0].name;

    const insert = `INSERT INTO appreciations (employee_id, employee_name, title, description, appreciation_date) VALUES (?, ?, ?, ?, ?)`;
    const [result] = await connection.execute(insert, [
      employee_id, employee_name,
      sanitizeForMySQL(title),
      sanitizeForMySQL(description) || '',
      sanitizeForMySQL(appreciation_date) || null
    ]);

    const select = `
      SELECT a.id, a.employee_id, a.employee_name, a.title, a.description, a.appreciation_date, a.created_at
      FROM appreciations a WHERE a.id = ?
    `;
    const [rows] = await connection.execute(select, [result.insertId]);

    if (rows.length > 0) {
      res.status(201).json({ item: rows[0] });
    } else {
      res.status(201).json({ id: result.insertId, message: 'Saved' });
    }
  } catch (err) {
    console.error('Error creating appreciation record:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/appreciations/bulk - Bulk delete (must be before /:id)
router.delete('/bulk', async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs array is required' });
  }

  const numericIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }

  const placeholders = numericIds.map(() => '?').join(',');
  const query = `DELETE FROM appreciations WHERE id IN (${placeholders})`;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute(query, numericIds);
    res.json({
      message: `${result.affectedRows} appreciation(s) deleted successfully`,
      deletedCount: result.affectedRows
    });
  } catch (err) {
    console.error('Error deleting appreciations:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/appreciations/:id - Delete single appreciation
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute('DELETE FROM appreciations WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Appreciation not found' });
    }
    res.json({ message: 'Appreciation deleted successfully' });
  } catch (err) {
    console.error('Error deleting appreciation:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// ─── Appreciation Types (mounted at /api/appreciation-types) ────
// These are exported separately and must be mounted at their own path
const typesRouter = require('express').Router();

// GET /api/appreciation-types
typesRouter.get('/', async (req, res) => {
  const query = 'SELECT id, name, status, created_at FROM appreciation_types WHERE status = "Active" ORDER BY name ASC';

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching appreciation types:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/appreciation-types
typesRouter.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const insert = 'INSERT INTO appreciation_types (name) VALUES (?)';
    const [result] = await connection.execute(insert, [sanitizeForMySQL(String(name).trim())]);

    const [rows] = await connection.execute(
      'SELECT id, name, status, created_at FROM appreciation_types WHERE id = ?',
      [result.insertId]
    );

    if (rows.length > 0) {
      res.status(201).json(rows[0]);
    } else {
      res.status(201).json({ id: result.insertId, message: 'Saved' });
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'This appreciation already exists' });
    }
    console.error('Error creating appreciation type:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
module.exports.typesRouter = typesRouter;
