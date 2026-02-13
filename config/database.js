require('dotenv').config();
const mysql = require('mysql2/promise');

// MySQL Database Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || '60000', 10),
  charset: process.env.MYSQL_CHARSET || 'utf8mb4'
};

// Create MySQL connection pool
const mysqlPool = mysql.createPool({
  ...mysqlConfig,
  connectionLimit: 10,
  acquireTimeout: 10000,
  timeout: 10000,
  queueLimit: 50,
  waitForConnections: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  idleTimeout: 300000,
  maxIdle: 5
});

console.log('MySQL connection pool created');

// Connection pool monitoring and cleanup
setInterval(async () => {
  try {
    const poolStats = {
      totalConnections: mysqlPool._allConnections?.length || 0,
      freeConnections: mysqlPool._freeConnections?.length || 0,
      acquiringConnections: mysqlPool._acquiringConnections?.length || 0,
      queuedRequests: mysqlPool._connectionQueue?.length || 0
    };

    if (poolStats.totalConnections > 8) {
      console.warn('⚠️ High connection pool usage:', poolStats);
    }

    if (poolStats.totalConnections > 5) {
      try {
        if (mysqlPool._allConnections) {
          mysqlPool._allConnections.forEach(conn => {
            if (conn._socket && conn._socket.readable && conn._socket.writable) {
              const lastUsed = conn._lastUsed || 0;
              const now = Date.now();
              if (now - lastUsed > 300000) { // 5 minutes
                console.log('🧹 Cleaning up idle connection');
                conn.destroy();
              }
            }
          });
        }
      } catch (error) {
        console.log('Connection cleanup error:', error.message);
      }
    }
  } catch (error) {
    console.log('Pool monitoring error:', error.message);
  }
}, 30000);

// MySQL health check
const checkMySQLHealth = async () => {
  try {
    const connection = await mysqlPool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error('MySQL health check failed:', error.message);
    return false;
  }
};

module.exports = { mysqlPool, checkMySQLHealth };