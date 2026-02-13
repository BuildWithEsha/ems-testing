const router = require('express').Router();
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');

// GET /api/errors - List all errors
router.get('/', async (req, res) => {
  const query = `
    SELECT e.id, e.employee_id, e.employee_name, e.task_id, e.severity, e.description, e.created_at, e.error_date,
           t.title AS task_title
    FROM errors e
    LEFT JOIN tasks t ON t.id = e.task_id
    ORDER BY e.created_at DESC
  `;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching errors:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/errors - Create an error record
router.post('/', async (req, res) => {
  const { employee_id, task_id, severity, description, error_date } = req.body;
  if (!employee_id || !task_id || !severity) {
    return res.status(400).json({ error: 'employee_id, task_id and severity are required' });
  }
  const employeeIdInt = parseInt(employee_id, 10);
  const taskIdInt = parseInt(task_id, 10);
  if (isNaN(employeeIdInt) || isNaN(taskIdInt)) {
    return res.status(400).json({ error: 'employee_id and task_id must be valid numbers' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [employees] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employeeIdInt]);
    if (employees.length === 0) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    const employee_name = employees[0].name;

    const insert = `INSERT INTO errors (employee_id, employee_name, task_id, severity, priority, description, error_date) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const errorDateVal = error_date && String(error_date).trim() ? sanitizeForMySQL(String(error_date).trim()) : null;
    const severityVal = severity || 'High';
    const [result] = await connection.execute(insert, [employeeIdInt, employee_name, taskIdInt, severityVal, severityVal, sanitizeForMySQL(description) || '', errorDateVal]);

    const select = `
      SELECT e.id, e.employee_id, e.employee_name, e.task_id, e.severity, e.description, e.created_at, e.error_date,
             t.title AS task_title
      FROM errors e LEFT JOIN tasks t ON t.id = e.task_id WHERE e.id = ?
    `;
    const [rows] = await connection.execute(select, [result.insertId]);

    if (rows.length > 0) {
      res.status(201).json({ item: rows[0] });
    } else {
      res.status(201).json({ id: result.insertId, message: 'Saved' });
    }
  } catch (err) {
    console.error('Error creating error record:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/errors/bulk - Delete multiple errors (must be before /:id)
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
  const query = `DELETE FROM errors WHERE id IN (${placeholders})`;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute(query, numericIds);
    res.json({
      message: `${result.affectedRows} error(s) deleted successfully`,
      deletedCount: result.affectedRows
    });
  } catch (err) {
    console.error('Error deleting errors:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/errors/:id - Delete single error
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute('DELETE FROM errors WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Error not found' });
    }
    res.json({ message: 'Error deleted successfully' });
  } catch (err) {
    console.error('Error deleting error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
