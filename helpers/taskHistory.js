const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('./sanitize');

// Helper function to log task history (non-blocking)
const logTaskHistory = async (taskId, action, description, userName, userId, oldValue = null, newValue = null) => {
  setImmediate(async () => {
    const query = `
      INSERT INTO task_history (task_id, action, description, user_name, user_id, old_value, new_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      await connection.execute(query, [
        taskId,
        sanitizeForMySQL(action),
        sanitizeForMySQL(description),
        sanitizeForMySQL(userName),
        userId,
        sanitizeForMySQL(oldValue),
        sanitizeForMySQL(newValue)
      ]);
      console.log(`📝 Task History Logged: Task ${taskId} - ${action} by ${userName}`);
    } catch (err) {
      console.error('Error logging task history (non-critical):', err);
      console.error('Failed to log:', { taskId, action, description, userName, userId, oldValue, newValue });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  });
};

module.exports = { logTaskHistory };
