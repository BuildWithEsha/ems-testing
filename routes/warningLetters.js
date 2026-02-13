const router = require('express').Router();
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');

// GET /api/warning-letters - List all warning letters
router.get('/', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT wl.id, wl.employee_id, wl.employee_name, wl.title, wl.description, wl.warning_date, wl.severity, wl.created_at
      FROM warning_letters wl
      ORDER BY wl.created_at DESC
    `;
    const [warningLetters] = await connection.execute(query);
    res.json(warningLetters);
  } catch (err) {
    console.error('Error fetching warning letters:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/warning-letters/bulk - Bulk delete (must be before /:id)
router.delete('/bulk', async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs array is required' });
  }

  const numericIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }

  const placeholders = numericIds.map(() => '?').join(',');
  const query = `DELETE FROM warning_letters WHERE id IN (${placeholders})`;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute(query, numericIds);
    res.json({
      message: `${result.affectedRows} warning letter(s) deleted successfully`,
      deletedCount: result.affectedRows
    });
  } catch (err) {
    console.error('Error deleting warning letters:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/warning-letters - Create new warning letter
router.post('/', async (req, res) => {
  const { employee_id, title, description, warning_date, severity } = req.body;
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

    const insert = `INSERT INTO warning_letters (employee_id, employee_name, title, description, warning_date, severity) VALUES (?, ?, ?, ?, ?, ?)`;
    const [result] = await connection.execute(insert, [
      employee_id, employee_name,
      sanitizeForMySQL(title),
      sanitizeForMySQL(description) || '',
      sanitizeForMySQL(warning_date) || null,
      sanitizeForMySQL(severity) || 'Low'
    ]);

    const select = `
      SELECT w.id, w.employee_id, w.employee_name, w.title, w.description, w.warning_date, w.severity, w.created_at
      FROM warning_letters w WHERE w.id = ?
    `;
    const [rows] = await connection.execute(select, [result.insertId]);

    if (rows.length > 0) {
      res.status(201).json({ item: rows[0] });
    } else {
      res.status(201).json({ id: result.insertId, message: 'Saved' });
    }
  } catch (err) {
    console.error('Error creating warning letter record:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/warning-letters/:id - Update warning letter
router.put('/:id', async (req, res) => {
  const warningLetterId = req.params.id;
  const updateData = req.body;
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      UPDATE warning_letters
      SET title = ?, description = ?, severity = ?, issued_by = ?, issued_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await connection.execute(query, [
      updateData.title,
      updateData.description,
      updateData.severity,
      updateData.issued_by,
      updateData.issued_date,
      updateData.status,
      warningLetterId
    ]);

    res.json({ message: 'Warning letter updated successfully' });
  } catch (err) {
    console.error('Error updating warning letter:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/warning-letters/:id - Delete warning letter
router.delete('/:id', async (req, res) => {
  const warningLetterId = req.params.id;
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    await connection.execute('DELETE FROM warning_letters WHERE id = ?', [warningLetterId]);
    res.json({ message: 'Warning letter deleted successfully' });
  } catch (err) {
    console.error('Error deleting warning letter:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// ─── Warning Letter Types (mounted at /api/warning-letter-types) ────
const typesRouter = require('express').Router();

// GET /api/warning-letter-types
typesRouter.get('/', async (req, res) => {
  const query = 'SELECT id, name, status, created_at FROM warning_letter_types WHERE status = "Active" ORDER BY name ASC';
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching warning letter types:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/warning-letter-types
typesRouter.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [result] = await connection.execute(
      'INSERT INTO warning_letter_types (name) VALUES (?)',
      [String(name).trim()]
    );

    const [rows] = await connection.execute(
      'SELECT id, name, status, created_at FROM warning_letter_types WHERE id = ?',
      [result.insertId]
    );

    if (rows.length > 0) {
      res.status(201).json(rows[0]);
    } else {
      res.status(201).json({ id: result.insertId, message: 'Saved' });
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'This warning letter type already exists' });
    }
    console.error('Error creating warning letter type:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
module.exports.typesRouter = typesRouter;

// Employee-scoped warning letters (mounted at /api/employees)
const employeeRouter = require('express').Router();

// GET /api/employees/:id/warning-letters
employeeRouter.get('/:id/warning-letters', async (req, res) => {
  const employeeId = req.params.id;
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT * FROM warning_letters 
      WHERE employee_id = ? 
      ORDER BY issued_date DESC
    `;

    const [warningLetters] = await connection.execute(query, [employeeId]);
    res.json(warningLetters);
  } catch (err) {
    console.error('Error fetching employee warning letters:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports.employeeRouter = employeeRouter;
