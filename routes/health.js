const router = require('express').Router();
const { checkMySQLHealth } = require('../config/database');

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const isHealthy = await checkMySQLHealth();
    if (isHealthy) {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'unhealthy', timestamp: new Date().toISOString() });
    }
  } catch (error) {
    res.status(503).json({ status: 'error', message: error.message, timestamp: new Date().toISOString() });
  }
});

module.exports = router;
