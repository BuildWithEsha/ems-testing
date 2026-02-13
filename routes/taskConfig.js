const router = require('express').Router();
const { mysqlPool } = require('../config/database');

// GET /api/task-config - Get task scoring configuration
router.get('/', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = 'SELECT config_type, config_data FROM task_configuration ORDER BY config_type';
    const [rows] = await connection.execute(query);

    // Defaults
    const config = {
      scoringWeights: {
        impact: 40,
        priority: 25,
        complexity: 15,
        effort: 10,
        labels: 10
      },
      scoringPoints: {
        impact: {
          'Compliance & Risk': 100,
          'Revenue Growth': 90,
          'Customer Experience': 80,
          'Cost Reduction': 70,
          'Efficiency & Process': 60,
          'Innovation & Development': 50,
          'Knowledge & Training': 40
        },
        priority: {
          'High': 100,
          'Medium': 60,
          'Low': 30
        },
        complexity: {
          'High': 40,
          'Medium': 70,
          'Low': 100
        },
        effort: {
          '1 Day': 100,
          '1 Week': 70,
          '1 Month': 40
        },
        labels: {
          'Deadline': 100,
          'Money': 95,
          'Sale': 90,
          'Improvements': 70,
          'Daily Operations': 50,
          'Daily Task': 50,
          'Weekly Task': 40,
          'Monthly Task': 30
        }
      }
    };

    // Override with database values if they exist
    rows.forEach(row => {
      if (row.config_type === 'scoring_weights') {
        config.scoringWeights = typeof row.config_data === 'string' ? JSON.parse(row.config_data) : row.config_data;
      } else if (row.config_type === 'scoring_points') {
        config.scoringPoints = typeof row.config_data === 'string' ? JSON.parse(row.config_data) : row.config_data;
      }
    });

    res.json(config);
  } catch (err) {
    console.error('Error fetching task configuration:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/task-config - Update task scoring configuration
router.post('/', async (req, res) => {
  const { scoringWeights, scoringPoints } = req.body;
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    if (scoringWeights) {
      await connection.execute(`
        INSERT INTO task_configuration (config_type, config_data)
        VALUES ('scoring_weights', ?)
        ON DUPLICATE KEY UPDATE config_data = VALUES(config_data)
      `, [JSON.stringify(scoringWeights)]);
    }

    if (scoringPoints) {
      await connection.execute(`
        INSERT INTO task_configuration (config_type, config_data)
        VALUES ('scoring_points', ?)
        ON DUPLICATE KEY UPDATE config_data = VALUES(config_data)
      `, [JSON.stringify(scoringPoints)]);
    }

    res.json({ message: 'Task configuration updated successfully' });
  } catch (err) {
    console.error('Error updating task configuration:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
