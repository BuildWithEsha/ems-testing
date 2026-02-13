const router = require('express').Router();
const { mysqlPool } = require('../config/database');

// GET /api/permissions - List all active permissions
router.get('/', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = 'SELECT * FROM permissions WHERE status = "Active" ORDER BY category, name';
    const [results] = await connection.execute(query);
    res.json(results);
  } catch (err) {
    console.error('Error fetching permissions:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
