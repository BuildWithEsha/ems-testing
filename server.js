const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

// Simple in-memory cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache middleware
const cacheMiddleware = (key, ttl = CACHE_TTL) => {
  return (req, res, next) => {
    const cacheKey = `${key}_${JSON.stringify(req.query)}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cached.data);
    }
    
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to cache response
    res.json = function(data) {
      cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      // Clean up old cache entries periodically
      if (cache.size > 100) {
        const now = Date.now();
        for (const [key, value] of cache.entries()) {
          if (now - value.timestamp > ttl) {
            cache.delete(key);
          }
        }
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
};

const app = express();
const PORT = process.env.PORT || 5000;

// MySQL Database Configuration for Tasks and Designations
const mysqlConfig = {
  host: process.env.MYSQL_HOST ,
  user: process.env.MYSQL_USER ,
  password: process.env.MYSQL_PASSWORD ,
  database: process.env.MYSQL_DATABASE ,
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || '60000', 10),
  charset: process.env.MYSQL_CHARSET || 'utf8mb4'
};

// Create MySQL connection pool for better performance
const mysqlPool = mysql.createPool({
  ...mysqlConfig,
  connectionLimit: 10,        // Reduced from 20 to 10 to be more conservative
  acquireTimeout: 10000,      // Reduced timeout to 10 seconds
  timeout: 10000,             // Reduced timeout to 10 seconds
  queueLimit: 50,             // Allow queuing for 50 requests
  waitForConnections: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  idleTimeout: 300000,        // Close idle connections after 5 minutes
  maxIdle: 5                  // Keep only 5 idle connections
});

console.log('MySQL connection pool created');

// Add connection pool monitoring and cleanup
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
  
  // Clean up idle connections every 5 minutes
  if (poolStats.totalConnections > 5) {
    try {
      // Force cleanup of idle connections
      if (mysqlPool._allConnections) {
        mysqlPool._allConnections.forEach(conn => {
          if (conn._socket && conn._socket.readable && conn._socket.writable) {
            // Check if connection is idle
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
}, 30000); // Check every 30 seconds

// MySQL connection health check
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

// Health check endpoint for page loads
app.get('/api/health', async (req, res) => {
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

// Run health check on server startup
(async () => {
  console.log('🔍 Running initial health check...');
  const isHealthy = await checkMySQLHealth();
  if (isHealthy) {
    console.log('✅ Initial health check passed');
  } else {
    console.warn('⚠️ Initial health check failed');
  }
})();

// Middleware
app.use(cors());
// Increase body size limit to allow base64 photos (max ~10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('build'));

// Helper function to log task history (non-blocking)
const logTaskHistory = async (taskId, action, description, userName, userId, oldValue = null, newValue = null) => {
  // Don't block the main operation if history logging fails
  setImmediate(async () => {
    const query = `
      INSERT INTO task_history (task_id, action, description, user_name, user_id, old_value, new_value, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    
    let connection;
    try {
      connection = await mysqlPool.getConnection();
      await connection.ping();
      await connection.execute(query, [taskId, action, description, userName, userId, oldValue, newValue]);
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
// Normalize various Assigned To payload shapes into a comma-separated string of names
const toAssignedToString = (taskData) => {
  if (!taskData) return '';
  if (typeof taskData.assigned_to === 'string' && taskData.assigned_to.trim()) {
    return taskData.assigned_to.trim();
  }
  const src = taskData.assignedTo;
  if (!src) return '';
  if (typeof src === 'string') return src;
  if (Array.isArray(src)) {
    return src
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if (item.label) return String(item.label).split(' (')[0];
          if (item.name) return String(item.name);
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  return '';
};

// MySQL Database Connection Pool (already configured above)
console.log('MySQL configuration loaded for tasks and designations');

// Initialize required database tables
const initializeDatabaseTables = async () => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Create task_history table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS task_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT NOT NULL,
        action VARCHAR(255) NOT NULL,
        description TEXT,
        user_name VARCHAR(255),
        user_id INT,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_task_id (task_id),
        INDEX idx_created_at (created_at)
      )
    `);
    
    // Create warning_letter_types table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS warning_letter_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create warning_letters table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS warning_letters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        warning_date DATE,
        severity ENUM('Low', 'Medium', 'High') DEFAULT 'Low',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_employee_id (employee_id),
        INDEX idx_warning_date (warning_date),
        INDEX idx_severity (severity),
        INDEX idx_created_at (created_at)
      )
    `);

    // Create task_configuration table for storing scoring weights and points
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS task_configuration (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_type ENUM('scoring_weights', 'scoring_points') NOT NULL,
        config_data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_config_type (config_type)
      )
    `);

    // Add password column to employees table if it doesn't exist
    try {
      await connection.execute(`
        ALTER TABLE employees ADD COLUMN password VARCHAR(255) DEFAULT 'admin123'
      `);
      console.log('Password column added to employees table');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('Password column already exists in employees table');
      } else {
        console.error('Error adding password column:', err.message);
      }
    }
    
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Initialize tables on startup
initializeDatabaseTables();

console.log('All MySQL database tables are ready');
console.log('All required columns are already present in MySQL tables');
console.log('Default permissions and roles are already configured in MySQL');

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper function to get permissions from headers
const getPermissionsFromHeaders = (req) => {
  const userPermissions = req.headers['x-user-permissions'];
  try {
    return JSON.parse(userPermissions);
  } catch (error) {
    console.error('Error parsing user permissions:', error);
    return [];
  }
};

// Helper function to create ticket notifications
const createNotification = async (userId, ticketId, type, title, message) => {
  let connection;
  try {
    console.log('Creating notification:', { userId, ticketId, type, title, message });
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      INSERT INTO ticket_notifications (user_id, ticket_id, notification_type, title, message)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await connection.execute(query, [userId, ticketId, type, title, message]);
    console.log('Notification inserted with ID:', result.insertId);
  } catch (err) {
    console.error('Error creating notification:', err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Notice Board API Routes
app.get('/api/notices', async (req, res) => {
  const { user_id, user_role } = req.query;
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    let whereClause = '';
    let queryParams = [];

    const isAdmin =
      (user_role && user_role.toLowerCase() === 'admin') ||
      user_id === 'admin' ||
      !user_id;

    if (user_id && !isAdmin) {
      whereClause = `
        WHERE n.id IN (
          SELECT DISTINCT notice_id
          FROM notice_recipients
          WHERE (recipient_type = 'employee' AND recipient_id = ?)
             OR (recipient_type = 'department' AND recipient_id IN (
                  SELECT department FROM employees WHERE id = ?
                ))
        )
      `;
      queryParams = [user_id, user_id];
    }

    let query;
    if (user_id === 'admin') {
      query = `
        SELECT
          n.*,
          CONCAT('User ', n.created_by) as created_by_name,
          GROUP_CONCAT(
            CONCAT(nr.recipient_type, ':', nr.recipient_name)
            SEPARATOR '|'
          ) as recipients_data,
          GROUP_CONCAT(
            CONCAT(na.file_name, ':', na.file_path, ':', na.file_size, ':', na.file_type)
            SEPARATOR '|'
          ) as attachments_data,
          FALSE as user_read_status,
          NULL as user_read_at
        FROM notices n
        LEFT JOIN notice_recipients nr ON n.id = nr.notice_id
        LEFT JOIN notice_attachments na ON n.id = na.notice_id
        ${whereClause}
        GROUP BY n.id
        ORDER BY n.created_at DESC
      `;
    } else {
      query = `
        SELECT
          n.*,
          CONCAT('User ', n.created_by) as created_by_name,
          GROUP_CONCAT(
            CONCAT(nr.recipient_type, ':', nr.recipient_name)
            SEPARATOR '|'
          ) as recipients_data,
          GROUP_CONCAT(
            CONCAT(na.file_name, ':', na.file_path, ':', na.file_size, ':', na.file_type)
            SEPARATOR '|'
          ) as attachments_data,
          nrs.is_read as user_read_status,
          nrs.read_at as user_read_at
        FROM notices n
        LEFT JOIN notice_recipients nr ON n.id = nr.notice_id
        LEFT JOIN notice_attachments na ON n.id = na.notice_id
        LEFT JOIN notice_read_status nrs ON n.id = nrs.notice_id AND nrs.user_id = ?
        ${whereClause}
        GROUP BY n.id
        ORDER BY n.created_at DESC
      `;
      queryParams.unshift(user_id || null);
    }

    const [rows] = await connection.execute(query, queryParams);

    const notices = rows.map(row => {
      const notice = {
        id: row.id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        status: row.status,
        created_by: row.created_by,
        created_by_name: row.created_by_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
        expiry_date: row.expiry_date,
        is_read: row.user_read_status || false,
        read_at: row.user_read_at,
        recipients: [],
        attachments: []
      };

      if (row.recipients_data) {
        notice.recipients = row.recipients_data.split('|').map(recipient => {
          const [type, name] = recipient.split(':');
          return { type, name };
        });
      }

      if (row.attachments_data) {
        notice.attachments = row.attachments_data.split('|').map(attachment => {
          const [name, path, size, type] = attachment.split(':');
          return { name, path, size: parseInt(size, 10), type };
        });
      }

      return notice;
    });

    res.json(notices);
  } catch (err) {
    console.error('Error fetching notices:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/notices/unread-count', async (req, res) => {
  const { user_id, user_role } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    let query;
    let queryParams;

    const isAdmin =
      (user_role && user_role.toLowerCase() === 'admin') ||
      user_id === 'admin';

    if (isAdmin) {
      if (user_id === 'admin') {
        query = `
          SELECT COUNT(DISTINCT n.id) as unread_count
          FROM notices n
          WHERE n.status = 'published'
        `;
        queryParams = [];
      } else {
        query = `
          SELECT COUNT(DISTINCT n.id) as unread_count
          FROM notices n
          LEFT JOIN notice_read_status nrs ON n.id = nrs.notice_id AND nrs.user_id = ?
          WHERE n.status = 'published'
            AND (nrs.is_read IS NULL OR nrs.is_read = FALSE)
        `;
        queryParams = [user_id];
      }
    } else {
      query = `
        SELECT COUNT(DISTINCT n.id) as unread_count
        FROM notices n
        INNER JOIN notice_recipients nr ON n.id = nr.notice_id
        LEFT JOIN notice_read_status nrs ON n.id = nrs.notice_id AND nrs.user_id = ?
        WHERE n.status = 'published'
          AND (
            (nr.recipient_type = 'employee' AND nr.recipient_id = ?)
            OR (nr.recipient_type = 'department' AND nr.recipient_id IN (
                  SELECT department FROM employees WHERE id = ?
                ))
          )
          AND (nrs.is_read IS NULL OR nrs.is_read = FALSE)
      `;
      queryParams = [user_id, user_id, user_id];
    }

    const [rows] = await connection.execute(query, queryParams);
    const unreadCount = rows[0].unread_count || 0;

    res.json({ unread_count: unreadCount });
  } catch (err) {
    console.error('Error fetching unread notice count:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/notices/:id', async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT
        n.*,
        CONCAT('User ', n.created_by) as created_by_name
      FROM notices n
      WHERE n.id = ?
    `;

    const [rows] = await connection.execute(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    const notice = rows[0];

    const recipientsQuery = `
      SELECT recipient_type, recipient_id, recipient_name, is_read, read_at
      FROM notice_recipients
      WHERE notice_id = ?
    `;
    const [recipients] = await connection.execute(recipientsQuery, [id]);
    notice.recipients = recipients;

    const attachmentsQuery = `
      SELECT file_name, file_path, file_size, file_type
      FROM notice_attachments
      WHERE notice_id = ?
    `;
    const [attachments] = await connection.execute(attachmentsQuery, [id]);
    notice.attachments = attachments;

    res.json(notice);
  } catch (err) {
    console.error('Error fetching notice:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/notices', async (req, res) => {
  const { title, description, priority, status, recipients, attachments, created_by } = req.body;

  if (!title || !description || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({ error: 'Title, description, and recipients are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    await connection.beginTransaction();

    const noticeQuery = `
      INSERT INTO notices (title, description, priority, status, created_by)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [noticeResult] = await connection.execute(
      noticeQuery,
      [title, description, priority || 'medium', status || 'draft', created_by]
    );

    const noticeId = noticeResult.insertId;

    for (const recipient of recipients) {
      const recipientQuery = `
        INSERT INTO notice_recipients (notice_id, recipient_type, recipient_id, recipient_name)
        VALUES (?, ?, ?, ?)
      `;
      await connection.execute(
        recipientQuery,
        [noticeId, recipient.type, recipient.value, recipient.label]
      );
    }

    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const attachmentQuery = `
          INSERT INTO notice_attachments (notice_id, file_name, file_path, file_size, file_type, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(
          attachmentQuery,
          [noticeId, attachment.name, attachment.path, attachment.size, attachment.type, created_by]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      message: 'Notice created successfully',
      notice_id: noticeId
    });
  } catch (err) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating notice:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.put('/api/notices/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, priority, status, recipients, attachments } = req.body;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    await connection.beginTransaction();

    const noticeQuery = `
      UPDATE notices
      SET title = ?, description = ?, priority = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await connection.execute(
      noticeQuery,
      [title, description, priority, status, id]
    );

    await connection.execute('DELETE FROM notice_recipients WHERE notice_id = ?', [id]);
    await connection.execute('DELETE FROM notice_attachments WHERE notice_id = ?', [id]);

    if (recipients && recipients.length > 0) {
      for (const recipient of recipients) {
        const recipientQuery = `
          INSERT INTO notice_recipients (notice_id, recipient_type, recipient_id, recipient_name)
          VALUES (?, ?, ?, ?)
        `;
        await connection.execute(
          recipientQuery,
          [id, recipient.type, recipient.value, recipient.label]
        );
      }
    }

    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const attachmentQuery = `
          INSERT INTO notice_attachments (notice_id, file_name, file_path, file_size, file_type, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(
          attachmentQuery,
          [id, attachment.name, attachment.path, attachment.size, attachment.type, attachment.uploaded_by]
        );
      }
    }

    await connection.commit();

    res.json({ message: 'Notice updated successfully' });
  } catch (err) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating notice:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.delete('/api/notices/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [result] = await connection.execute('DELETE FROM notices WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    res.json({ message: 'Notice deleted successfully' });
  } catch (err) {
    console.error('Error deleting notice:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/notices/:id/mark-read', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const checkQuery = `
      SELECT id
      FROM notice_read_status
      WHERE notice_id = ? AND user_id = ?
    `;
    const [existing] = await connection.execute(checkQuery, [id, userId]);

    if (existing.length > 0) {
      const updateQuery = `
        UPDATE notice_read_status
        SET is_read = TRUE, read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE notice_id = ? AND user_id = ?
      `;
      await connection.execute(updateQuery, [id, userId]);
    } else {
      const insertQuery = `
        INSERT INTO notice_read_status (notice_id, user_id, is_read, read_at)
        VALUES (?, ?, TRUE, CURRENT_TIMESTAMP)
      `;
      await connection.execute(insertQuery, [id, userId]);
    }

    res.json({ message: 'Notice marked as read' });
  } catch (err) {
    console.error('Error marking notice as read:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/notices/upload', async (req, res) => {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads', 'notice-attachments');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024
    }
  }).array('files', 10);

  upload(req, res, (err) => {
    if (err) {
      console.error('Notice attachment upload error:', err);
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files.map(file => ({
      name: file.originalname,
      path: file.path,
      size: file.size,
      type: file.mimetype
    }));

    res.json({ files });
  });
});

// Authentication endpoint
app.post('/api/auth', async (req, res) => {
  const { username, password } = req.body;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT id, name, role, permissions
      FROM users
      WHERE username = ? AND password = ?
    `;

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
    if (connection) {
      connection.release();
    }
  }
});

// API Routes
// Reports APIs
// DWM Report - Get daily/weekly/monthly task completion statistics
app.get('/api/reports/dwm', async (req, res) => {
  const { startDate, endDate, department, employee } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Get all completed tasks (regardless of completion date)
    // Use the created_at timestamp to determine when task was marked as completed
    let completedQuery = `
      SELECT 
        t.id,
        t.title,
        t.labels,
        t.status,
        th.created_at as completed_date
      FROM task_history th
      JOIN tasks t ON th.task_id = t.id
      WHERE th.action = 'Status changed'
        AND th.new_value = 'Completed'
    `;
    
    // Add filters to completed query
    if (department) {
      completedQuery += ' AND t.department = ?';
    }
    if (employee) {
      completedQuery += ' AND t.assigned_to LIKE ?';
    }
    // Get total tasks count (all tasks, not just completed)
    let totalQuery = `
      SELECT 
        COUNT(CASE WHEN LOWER(t.labels) LIKE '%daily%' THEN 1 END) as daily_total,
        COUNT(CASE WHEN LOWER(t.labels) LIKE '%weekly%' THEN 1 END) as weekly_total,
        COUNT(CASE WHEN LOWER(t.labels) LIKE '%monthly%' THEN 1 END) as monthly_total
      FROM tasks t
      WHERE 1=1
    `;
    
    const totalParams = [];
    if (department) {
      totalQuery += ' AND t.department = ?';
      totalParams.push(department);
    }
    if (employee) {
      totalQuery += ' AND t.assigned_to LIKE ?';
      totalParams.push(`%${employee}%`);
    }
    
    console.log('🔍 DWM Debug - Total Query:', totalQuery);
    console.log('🔍 DWM Debug - Total Params:', totalParams);
    
    // Execute both queries
    const completedParams = [];
    if (department) {
      completedParams.push(department);
    }
    if (employee) {
      completedParams.push(`%${employee}%`);
    }
    const [completedRows] = await connection.execute(completedQuery, completedParams);
    const [totalRows] = await connection.execute(totalQuery, totalParams);
    console.log('🔍 DWM Debug - Completed Rows:', completedRows.length);
    console.log('🔍 DWM Debug - Total Data:', totalRows[0]);
    
    // Get all tasks to determine which days they should appear on
    let allTasksQuery = `
      SELECT id, title, labels, status
      FROM tasks t
      WHERE 1=1
    `;
    const allTasksParams = [];
    if (department) {
      allTasksQuery += ' AND t.department = ?';
      allTasksParams.push(department);
    }
    if (employee) {
      allTasksQuery += ' AND t.assigned_to LIKE ?';
      allTasksParams.push(`%${employee}%`);
    }
    
    const [allTasks] = await connection.execute(allTasksQuery, allTasksParams);
    
    // Get total counts (single row)
    const totals = totalRows[0] || { daily_total: 0, weekly_total: 0, monthly_total: 0 };
    
    // Don't deduplicate here - we need to keep all completion records
    // to correctly count when each task was completed
    // Deduplication will happen per-day when filtering by completion date
    const completedRowsWithDates = completedRows.map(task => {
      // Convert completed_date to YYYY-MM-DD format for comparison
      let taskCompletedDate;
      if (task.completed_date instanceof Date) {
        taskCompletedDate = task.completed_date.toISOString().split('T')[0];
      } else if (typeof task.completed_date === 'string') {
        // Parse the MySQL datetime string
        const date = new Date(task.completed_date);
        taskCompletedDate = date.toISOString().split('T')[0];
      } else {
        taskCompletedDate = task.completed_date;
      }
      
      
      return {
        ...task,
        completed_date_formatted: taskCompletedDate
      };
    });
    
    // Generate data for each day in the range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = [];
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayIso = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const dayOfMonth = d.getDate();
      
      // Calculate completed counts for this specific day
      let dailyCompleted = 0;
      let weeklyCompleted = 0;
      let monthlyCompleted = 0;
      
      // For daily tasks, we only want to count tasks that were completed ON THIS SPECIFIC DAY
      // Filter tasks that were completed on this day
      const completedOnThisDay = completedRowsWithDates.filter(task => {
        if (!task.completed_date_formatted) return false;
        const matches = task.completed_date_formatted === dayIso;
        
        return matches;
      });
      
      // Deduplicate tasks on this day (in case same task was completed multiple times)
      const uniqueCompletedTasksOnDay = new Map();
      completedOnThisDay.forEach(task => {
        if (!uniqueCompletedTasksOnDay.has(task.id)) {
          uniqueCompletedTasksOnDay.set(task.id, task);
        }
      });
      const uniqueCompletedOnThisDay = Array.from(uniqueCompletedTasksOnDay.values());
      
      // Daily tasks show completed count on all days, but only count those completed on this day
      dailyCompleted = uniqueCompletedOnThisDay.filter(task => 
        task.labels && task.labels.toLowerCase().includes('daily')
      ).length;
      
      // Weekly tasks show completed count only on their specific day
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDayName = dayNames[dayOfWeek];
      
      weeklyCompleted = uniqueCompletedOnThisDay.filter(task => 
        task.labels && task.labels.toLowerCase().includes('weekly') &&
        task.title && task.title.toLowerCase().includes(currentDayName)
      ).length;
      
      // Monthly tasks show completed count only on their specific day
      monthlyCompleted = uniqueCompletedOnThisDay.filter(task => 
        task.labels && task.labels.toLowerCase().includes('monthly') &&
        task.title && task.title.toLowerCase().includes(`${dayOfMonth} of month`)
      ).length;
      
      const completedData = {
        daily_completed: dailyCompleted,
        weekly_completed: weeklyCompleted,
        monthly_completed: monthlyCompleted
      };
      
      // Calculate totals for this specific day
      let dailyTotal = 0;
      let weeklyTotal = 0;
      let monthlyTotal = 0;
      
      // Daily tasks show on all days
      dailyTotal = totals.daily_total;
      
      // Weekly tasks show only on their specific day
      weeklyTotal = allTasks.filter(task => 
        task.labels && task.labels.toLowerCase().includes('weekly') &&
        task.title && task.title.toLowerCase().includes(currentDayName)
      ).length;
      
      // Monthly tasks show only on their specific day
      monthlyTotal = allTasks.filter(task => 
        task.labels && task.labels.toLowerCase().includes('monthly') &&
        task.title && task.title.toLowerCase().includes(`${dayOfMonth} of month`)
      ).length;
      
      days.push({
        day: dayIso,
        daily_completed: completedData.daily_completed,
        weekly_completed: completedData.weekly_completed,
        monthly_completed: completedData.monthly_completed,
        daily_total: dailyTotal,
        weekly_total: weeklyTotal,
        monthly_total: monthlyTotal
      });
    }
    
    res.json(days);
  } catch (err) {
    console.error('Error fetching DWM report:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Time Log Report - Get time tracking data (REMOVED DUPLICATE - using task_timesheet table instead)

// Helper to format attendance timestamps consistently for clients
const formatAttendanceDate = (value) => {
  if (!value) {
    return null;
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  if (!date) {
    return typeof value === 'string' ? value : null;
  }

  return date
    .toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' })
    .replace(' ', 'T');
};
// Attendance APIs
// Get current status for an employee
app.get('/api/attendance/status', async (req, res) => {
  const { employee_id } = req.query;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Get today's date in Pakistan timezone to match clock out logic
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).split(' ')[0]; // Get date in YYYY-MM-DD format
    
    const query = `SELECT * FROM attendance WHERE employee_id = ? AND date = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1`;
    const [rows] = await connection.execute(query, [employee_id, today]);
    
    let entry = null;

    if (rows.length > 0) {
      const row = rows[0];
      entry = {
        ...row,
        clock_in: formatAttendanceDate(row.clock_in),
        clock_out: formatAttendanceDate(row.clock_out)
      };
    }

    res.json({
      active: Boolean(entry),
      entry,
      totalDailyDuration: entry ? entry.duration_seconds || 0 : 0
    });
  } catch (err) {
    console.error('Error fetching attendance status:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Clock in
app.post('/api/attendance/clock-in', async (req, res) => {
  const { employee_id, when } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Store local Pakistan time - use consistent timezone handling
    const now = when || new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T');
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).split(' ')[0]; // Get date in YYYY-MM-DD format
    
    // Get employee name
    const [employeeRows] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employeeRows.length === 0) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    const employeeName = employeeRows[0].name;
    
    // Check if there's already an open session for today
    const [existingRows] = await connection.execute(
      'SELECT id FROM attendance WHERE employee_id = ? AND date = ? AND clock_out IS NULL', 
      [employee_id, today]
    );
    if (existingRows.length > 0) {
      return res.status(400).json({ error: 'Already clocked in for today' });
    }
    
    // Check if there's already a record for today (for session tracking)
    const [todayRecord] = await connection.execute(
      'SELECT id, session_count, duration_seconds FROM attendance WHERE employee_id = ? AND date = ? ORDER BY id DESC LIMIT 1', 
      [employee_id, today]
    );
    
    if (todayRecord.length > 0) {
      // Update existing record with new session - preserve previous duration
      const currentSessionCount = todayRecord[0].session_count || 1;
      const previousDuration = todayRecord[0].duration_seconds || 0;
      await connection.execute(
        'UPDATE attendance SET session_count = ?, clock_in = ?, clock_out = NULL WHERE id = ?', 
        [currentSessionCount + 1, now, todayRecord[0].id]
      );
      res.status(200).json({
        id: todayRecord[0].id,
        employee_id,
        employee_name: employeeName,
        date: today,
        clock_in: formatAttendanceDate(now),
        session_count: currentSessionCount + 1
      });
    } else {
      // Create new record for today
      const [result] = await connection.execute(
        'INSERT INTO attendance (employee_id, employee_name, date, clock_in, session_count) VALUES (?, ?, ?, ?, 1)', 
        [employee_id, employeeName, today, now]
      );
      res.status(201).json({
        id: result.insertId,
        employee_id,
        employee_name: employeeName,
        date: today,
        clock_in: formatAttendanceDate(now),
        session_count: 1
      });
    }
  } catch (err) {
    console.error('Error clocking in:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Clock out
app.post('/api/attendance/clock-out', async (req, res) => {
  const { employee_id, when } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Store local Pakistan time - use consistent timezone handling
    const now = when || new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T');
    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).split(' ')[0]; // Get date in YYYY-MM-DD format
    
    // Get the open attendance record for today
    const [rows] = await connection.execute(
      'SELECT id, clock_in, session_count, duration_seconds FROM attendance WHERE employee_id = ? AND date = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1', 
      [employee_id, today]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Not clocked in for today' });
    }
    
    const row = rows[0];
    
    const normalizeToDate = (value) => {
      if (!value) {
        return null;
      }

      if (value instanceof Date) {
        return value;
      }

      const strValue = String(value).trim();
      if (!strValue) {
        return null;
      }

      if (strValue.includes('T')) {
        return new Date(strValue.replace(' ', 'T'));
      }

      if (strValue.includes(' ')) {
        const [datePart, timePart] = strValue.split(' ');
        return new Date(`${datePart}T${timePart}`);
      }

      return new Date(`${today}T${strValue}`);
    };

    const clockInTime = normalizeToDate(row.clock_in);
    const nowDate = normalizeToDate(now);
    const nowForDb = now.replace('T', ' ');

    const currentSessionDuration = Math.max(0, Math.floor(((nowDate || new Date()) - (clockInTime || new Date())) / 1000));
    
    // Calculate total duration (previous sessions + current session)
    const previousDuration = row.duration_seconds || 0;
    const totalDurationSeconds = previousDuration + currentSessionDuration;
    const totalHoursWorked = Number((totalDurationSeconds / 3600).toFixed(4));
    
    // Update the record with clock-out time and total duration
    await connection.execute(
      'UPDATE attendance SET clock_out = ?, duration_seconds = ?, hours_worked = ? WHERE id = ?', 
      [nowForDb, totalDurationSeconds, totalHoursWorked, row.id]
    );
    
    res.json({ 
      id: row.id, 
      employee_id, 
      clock_in: formatAttendanceDate(clockInTime || row.clock_in), 
      clock_out: formatAttendanceDate(nowDate || now), 
      duration_seconds: totalDurationSeconds,
      hours_worked: totalHoursWorked,
      session_count: row.session_count || 1
    });
  } catch (err) {
    console.error('Error clocking out:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Monthly summary and entries
app.get('/api/attendance/summary', async (req, res) => {
  const { employee_id, month, year } = req.query;
  if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
  const now = new Date();
  const useMonth = month ? parseInt(month, 10) : now.getMonth() + 1; // 1-12
  const useYear = year ? parseInt(year, 10) : now.getFullYear();
  const start = new Date(useYear, useMonth - 1, 1).toISOString();
  const end = new Date(useYear, useMonth, 1).toISOString();
    
  const query = `SELECT * FROM attendance WHERE employee_id = ? AND clock_in >= ? AND clock_in < ? ORDER BY clock_in DESC`;
    const [rows] = await connection.execute(query, [employee_id, start, end]);
    
    const totalSeconds = rows.reduce((s, r) => s + (r.duration_seconds || 0), 0);
    res.json({ total_seconds: totalSeconds, entries: rows });
  } catch (err) {
    console.error('Error fetching attendance summary:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Add manual attendance record
app.post('/api/attendance/add', async (req, res) => {
  const { employee_id, date, clock_in, clock_out, hours_worked } = req.body;
  
  if (!employee_id || !date || !clock_in) {
    return res.status(400).json({ error: 'employee_id, date, and clock_in are required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
  
  // Get employee name
    const [employees] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employees.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employee_name = employees[0].name;
    let durationSeconds = 0;
    
    // Calculate duration if clock_out is provided
    if (clock_out) {
      const clockInTime = new Date(`${date}T${clock_in}`);
      const clockOutTime = new Date(`${date}T${clock_out}`);
      durationSeconds = Math.max(0, Math.floor((clockOutTime - clockInTime) / 1000));
    }
    
    // Use hours_worked if provided, otherwise calculate from duration
    const finalHoursWorked = hours_worked || (durationSeconds / 3600);
    
    const insert = `
      INSERT INTO attendance (employee_id, employee_name, date, clock_in, clock_out, duration_seconds, hours_worked) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await connection.execute(insert, [employee_id, employee_name, date, clock_in, clock_out || null, durationSeconds, finalHoursWorked]);
      
      res.status(201).json({ 
      id: result.insertId, 
        employee_id, 
        employee_name,
        date, 
        clock_in, 
        clock_out, 
        duration_seconds: durationSeconds,
        hours_worked: finalHoursWorked,
        message: 'Attendance record added successfully' 
      });
  } catch (err) {
    console.error('Error adding attendance record:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Update attendance record
app.put('/api/attendance/:id', async (req, res) => {
  const { id } = req.params;
  const { date, clock_in, clock_out, hours_worked } = req.body;
  
  if (!date || !clock_in) {
    return res.status(400).json({ error: 'date and clock_in are required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
  
  let durationSeconds = 0;
  
  // Calculate duration if clock_out is provided
  if (clock_out) {
    const clockInTime = new Date(`${date}T${clock_in}`);
    const clockOutTime = new Date(`${date}T${clock_out}`);
    durationSeconds = Math.max(0, Math.floor((clockOutTime - clockInTime) / 1000));
  }
  
  // Use hours_worked if provided, otherwise calculate from duration
  const finalHoursWorked = hours_worked || (durationSeconds / 3600);
  
  const update = `
    UPDATE attendance 
    SET date = ?, clock_in = ?, clock_out = ?, duration_seconds = ?, hours_worked = ?
    WHERE id = ?
  `;
  
    const [result] = await connection.execute(update, [date, clock_in, clock_out || null, durationSeconds, finalHoursWorked, id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    
    res.json({ 
      id, 
      date, 
      clock_in, 
      clock_out, 
      duration_seconds: durationSeconds,
      hours_worked: finalHoursWorked,
      message: 'Attendance record updated successfully' 
    });
  } catch (err) {
    console.error('Error updating attendance record:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Clear all attendance data - MUST come FIRST (before :id route)
app.delete('/api/attendance/clear-all', async (req, res) => {
  console.log('Clear all attendance data request received');
  
  // Double confirmation - this is a dangerous operation
  if (!req.headers['x-confirm-clear-all']) {
    return res.status(400).json({ 
      error: 'Missing confirmation header. This operation requires explicit confirmation.' 
    });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // First, get a count of all records
    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM attendance');
    const totalRecords = countResult[0].total;
    console.log(`Found ${totalRecords} attendance records to delete`);
    
    if (totalRecords === 0) {
      return res.json({ 
        message: 'No attendance records found to delete', 
        deletedCount: 0 
      });
    }
    
    // Delete all attendance records
    await connection.execute('DELETE FROM attendance');
      
      console.log(`Successfully cleared ${totalRecords} attendance records`);
      res.json({ 
        message: `Successfully cleared all ${totalRecords} attendance records from the database`, 
        deletedCount: totalRecords 
      });
  } catch (err) {
    console.error('Error clearing all attendance data:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Bulk delete attendance records - MUST come BEFORE /:id route
app.delete('/api/attendance/bulk', async (req, res) => {
  const { ids } = req.body;
  console.log('Bulk delete request - IDs:', ids);
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs array is required' });
  }
  
  // Convert IDs to numbers to ensure proper comparison
  const numericIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
  
  // First, check which IDs actually exist in the database
    const placeholders = numericIds.map(() => '?').join(',');
    const checkQuery = `SELECT id FROM attendance WHERE id IN (${placeholders})`;
  console.log('Checking existing IDs with query:', checkQuery, 'params:', numericIds);
  
    const [existingRecords] = await connection.execute(checkQuery, numericIds);
    
    const existingIds = existingRecords.map(record => record.id);
    console.log('Existing IDs found:', existingIds);
    
    if (existingIds.length === 0) {
      return res.status(404).json({ error: 'No attendance records found with the provided IDs' });
    }
    
    // Delete only the records that exist
    const deletePlaceholders = existingIds.map(() => '?').join(',');
    const deleteQuery = `DELETE FROM attendance WHERE id IN (${deletePlaceholders})`;
    console.log('Delete query:', deleteQuery, 'with params:', existingIds);
    
    const [result] = await connection.execute(deleteQuery, existingIds);
    console.log('Bulk delete result - affected rows:', result.affectedRows);
      res.json({ 
      message: `${result.affectedRows} attendance record(s) deleted successfully`, 
      deletedCount: result.affectedRows 
    });
  } catch (err) {
    console.error('Error deleting attendance records:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Delete attendance record - MUST come AFTER specific routes
app.delete('/api/attendance/:id', async (req, res) => {
  const { id } = req.params;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const [result] = await connection.execute('DELETE FROM attendance WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (err) {
    console.error('Error deleting attendance:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});



// Get all attendance records with filters
app.get('/api/attendance/records', async (req, res) => {
  const { employee_id, from_date, to_date, start_date, end_date, exclude_imported } = req.query;
  
  let where = '1=1';
  const params = [];
  
  if (employee_id) {
    where += ' AND employee_id = ?';
    params.push(employee_id);
  }
  
  // Support both from_date/to_date and start_date/end_date for backward compatibility
  const dateFrom = from_date || start_date;
  const dateTo = to_date || end_date;
  
  if (dateFrom) {
    where += ' AND date >= ?';
    params.push(dateFrom);
  }
  
  if (dateTo) {
    where += ' AND date <= ?';
    params.push(dateTo);
  }
  
  // Exclude imported records (records created via import)
  if (exclude_imported === 'true') {
    where += ' AND (is_imported = 0 OR is_imported IS NULL)';
  }
  
  const query = `
    SELECT id, employee_id, employee_name, date, clock_in, clock_out, duration_seconds, hours_worked, session_count, created_at
    FROM attendance 
    WHERE ${where}
    ORDER BY date DESC, clock_in DESC
  `;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Ensure session_count column exists
    try {
      await connection.execute('ALTER TABLE attendance ADD COLUMN session_count INT DEFAULT 1');
    } catch (err) {
      // Column already exists, ignore error
    }
    
    const [rows] = await connection.execute(query, params);
    res.json(rows);
  } catch (err) {
      console.error('Error fetching attendance records:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Debug endpoint to check attendance records
app.get('/api/attendance/debug', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
  const query = 'SELECT id, employee_name, date, clock_in, clock_out FROM attendance ORDER BY id DESC LIMIT 10';
    const [rows] = await connection.execute(query);
    
    res.json({ 
      totalRecords: rows.length,
      records: rows 
    });
  } catch (err) {
    console.error('Error fetching attendance debug data:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Get attendance summary statistics
app.get('/api/attendance/summary', async (req, res) => {
  const { employee_id, from_date, to_date, exclude_imported } = req.query;
  
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'from_date and to_date are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Calculate total working days in the date range (MySQL version)
  const workingDaysQuery = `
    WITH RECURSIVE dates(date) AS (
      SELECT ? as date
      UNION ALL
        SELECT DATE_ADD(date, INTERVAL 1 DAY)
      FROM dates
      WHERE date <= ?
    )
    SELECT COUNT(*) as total_working_days
    FROM dates
      WHERE DAYOFWEEK(date) NOT IN (1, 7) -- Exclude Sunday (1) and Saturday (7)
    `;

    const [workingDaysResult] = await connection.execute(workingDaysQuery, [from_date, to_date]);
    const totalWorkingDays = workingDaysResult[0].total_working_days || 0;

    // Now get attendance data for the date range
    let attendanceQuery = `
      SELECT 
        COUNT(DISTINCT a.date) as total_days,
        SUM(a.hours_worked) as total_hours,
        SUM(a.duration_seconds) as total_seconds
      FROM attendance a 
      WHERE a.date >= ? AND a.date <= ?
    `;
    const attendanceParams = [from_date, to_date];

    if (employee_id) {
      attendanceQuery += ' AND a.employee_id = ?';
      attendanceParams.push(employee_id);
    }
    if (exclude_imported === 'true') {
      attendanceQuery += ' AND (a.is_imported = 0 OR a.is_imported IS NULL)';
    }

    const [attendanceResult] = await connection.execute(attendanceQuery, attendanceParams);
    const attendanceRow = attendanceResult[0];
      
      const totalDays = attendanceRow.total_days || 0;
      const totalHours = attendanceRow.total_hours || 0;
      const absentees = Math.max(0, totalWorkingDays - totalDays);
      
      const summary = {
        total_days: totalDays,
        total_hours: totalHours,
        total_seconds: attendanceRow.total_seconds || 0,
        absentees: absentees,
        total_working_days: totalWorkingDays
      };
      
      res.json(summary);
  } catch (err) {
    console.error('Error fetching attendance summary:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Test endpoint to verify clear-all route is accessible
app.get('/api/attendance/test-clear-all', (req, res) => {
  res.json({ 
    message: 'Clear-all route is accessible',
    route: '/api/attendance/clear-all',
    method: 'DELETE',
    requiredHeader: 'x-confirm-clear-all: true'
  });
});
// Import attendance records from Excel file
app.post('/api/attendance/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length < 2) {
      return res.status(400).json({ error: 'File must contain at least a header row and one data row' });
    }

    const headers = data[0];
    const rows = data.slice(1);

    // Expected columns: Employee Name, Date, Clock In, Clock Out
    const employeeNameIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('employee'));
    const dateIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('date'));
    const clockInIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('clock in'));
    const clockOutIndex = headers.findIndex(h => h && h.toString().toLowerCase().includes('clock out'));

    if (employeeNameIndex === -1 || dateIndex === -1 || clockInIndex === -1) {
      return res.status(400).json({ 
        error: 'File must contain columns: Employee Name, Date, Clock In (Clock Out is optional)' 
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(cell => !cell)) continue; // Skip empty rows

      try {
        const employeeName = row[employeeNameIndex];
        const date = row[dateIndex];
        const clockIn = row[clockInIndex];
        const clockOut = row[clockOutIndex] || null;

        if (!employeeName || !date || !clockIn) {
          errors.push(`Row ${i + 2}: Missing required fields (Employee Name, Date, or Clock In)`);
          errorCount++;
          continue;
        }

        // Find employee by name
        const [employees] = await connection.execute('SELECT id, name FROM employees WHERE LOWER(name) = LOWER(?)', [employeeName]);
        const employee = employees[0];

        if (!employee) {
          errors.push(`Row ${i + 2}: Employee "${employeeName}" not found`);
          errorCount++;
          continue;
        }

        // Format date and times
        let formattedDate = date;
        console.log(`Processing row ${i + 2}: Original date value:`, date, 'Type:', typeof date);
        
        if (date instanceof Date) {
          formattedDate = date.toISOString().split('T')[0];
        } else if (typeof date === 'string') {
          // Try to parse various date formats
          const parsedDate = new Date(date);
          if (!isNaN(parsedDate.getTime())) {
            formattedDate = parsedDate.toISOString().split('T')[0];
          }
        } else if (typeof date === 'number') {
          // Handle Excel serial numbers
          const excelDate = new Date((date - 25569) * 86400 * 1000);
          formattedDate = excelDate.toISOString().split('T')[0];
        }
        
        console.log(`Row ${i + 2}: Formatted date:`, formattedDate);

        // Check for existing record for this employee and date
        const [existingRecords] = await connection.execute('SELECT id FROM attendance WHERE employee_id = ? AND date = ?', [employee.id, formattedDate]);
        const existingRecord = existingRecords[0];

        if (existingRecord) {
          errors.push(`Row ${i + 2}: Record already exists for ${employeeName} on ${formattedDate}`);
          errorCount++;
          continue;
        }

        // Format clock in time
        let formattedClockIn = clockIn;
        if (clockIn instanceof Date) {
          formattedClockIn = clockIn.toTimeString().slice(0, 5);
        } else if (typeof clockIn === 'number') {
          // Handle Excel serial time format (0.0 = midnight, 0.5 = noon, etc.)
          const hours = Math.floor(clockIn * 24);
          const minutes = Math.floor((clockIn * 24 * 60) % 60);
          formattedClockIn = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } else if (typeof clockIn === 'string') {
          // Handle string time formats like "11:00" or "11:00:00"
          const timeMatch = clockIn.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            formattedClockIn = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          }
        }
        // Format clock out time
        let formattedClockOut = clockOut;
        if (clockOut instanceof Date) {
          formattedClockOut = clockOut.toTimeString().slice(0, 5);
        } else if (typeof clockOut === 'number') {
          // Handle Excel serial time format
          const hours = Math.floor(clockOut * 24);
          const minutes = Math.floor((clockOut * 24 * 60) % 60);
          formattedClockOut = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } else if (typeof clockOut === 'string') {
          // Handle string time formats
          const timeMatch = clockOut.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            formattedClockOut = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          }
        }

        // Calculate duration if clock out is provided
        let durationSeconds = 0;
        let finalHoursWorked = 0;
        
        if (formattedClockOut) {
          const clockInTime = new Date(`${formattedDate}T${formattedClockIn}`);
          const clockOutTime = new Date(`${formattedDate}T${formattedClockOut}`);
          durationSeconds = Math.max(0, Math.floor((clockOutTime - clockInTime) / 1000));
          finalHoursWorked = durationSeconds / 3600;
        } else {
          // If no clock out, set default duration based on expected work day (8 hours)
          durationSeconds = 8 * 3600; // 8 hours in seconds
          finalHoursWorked = 8; // 8 hours
        }

        // Insert attendance record
          const insert = `
            INSERT INTO attendance (employee_id, employee_name, date, clock_in, clock_out, duration_seconds, hours_worked, is_imported) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `;
          
        await connection.execute(insert, [
            employee.id, 
            employee.name, 
            formattedDate, 
            formattedClockIn, 
            formattedClockOut, 
            durationSeconds, 
            finalHoursWorked
        ]);

        successCount++;
      } catch (error) {
        console.error(`Error processing row ${i + 2}:`, error);
        errors.push(`Row ${i + 2}: ${error.message}`);
        errorCount++;
      }
    }

    res.json({
      message: `Import completed. ${successCount} records imported successfully, ${errorCount} errors.`,
      successCount,
      errorCount,
      errors: errors.slice(0, 10) // Limit error messages
    });

  } catch (error) {
    console.error('Error processing attendance import:', error);
    res.status(500).json({ error: 'Error processing file: ' + error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Download attendance import sample file
app.get('/api/attendance/sample', (req, res) => {
  try {
    const workbook = xlsx.utils.book_new();
    
    // Sample data
    const sampleData = [
      ['Employee Name', 'Date', 'Clock In', 'Clock Out'],
      ['Junaid Arshad', '2025-05-01', '09:00', '17:00'],
      ['Junaid Arshad', '2025-05-02', '08:30', '17:30'],
      ['Junaid Arshad', '2025-05-03', '09:15', '18:15'],
      ['', '', '', ''],
      ['Instructions:', '', '', ''],
      ['1. Employee Name: Must match exactly with employee names in the system', '', '', ''],
      ['2. Date: Use YYYY-MM-DD format (e.g., 2025-05-01)', '', '', ''],
      ['3. Clock In: Use HH:MM format (e.g., 09:00)', '', '', ''],
      ['4. Clock Out: Use HH:MM format (e.g., 17:00) - Optional', '', '', ''],
      ['5. Hours will be calculated automatically from Clock In and Clock Out times', '', '', '']
    ];

    const worksheet = xlsx.utils.aoa_to_sheet(sampleData);
    
    // Set column widths
    worksheet['!cols'] = [
      { width: 20 }, // Employee Name
      { width: 15 }, // Date
      { width: 12 }, // Clock In
      { width: 12 }  // Clock Out
    ];

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Attendance Import');
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance_import_sample.xlsx');
    
    // Write to buffer and send
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);

  } catch (error) {
    console.error('Error generating sample file:', error);
    res.status(500).json({ error: 'Error generating sample file' });
  }
});

// Time Log Report API - grouped by task per day with filters and totals
app.get('/api/reports/timelog', async (req, res) => {
  const { start, end, employee, department } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });

  // Build dynamic filters
  const params = [];
  let where = `tt.start_time >= ? AND tt.start_time < ?`;
  const startIso = `${start}T00:00:00.000Z`;
  const endIso = `${end}T23:59:59.999Z`;
  params.push(startIso, endIso);

  if (employee) {
    where += ` AND tt.employee_name = ?`;
    params.push(employee);
  }
  if (department) {
    where += ` AND t.department = ?`;
    params.push(department);
  }

  const query = `
    SELECT tt.employee_name, t.title AS task_title, t.labels, t.priority,
           DATE(substr(replace(replace(tt.start_time, 'T', ' '), 'Z', ''), 1, 19)) as date,
           SUM(
             CASE 
               WHEN tt.hours_logged_seconds > 0 THEN tt.hours_logged_seconds
               WHEN tt.hours_logged > 0 THEN tt.hours_logged
               WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN 
                 TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time)
               ELSE 0
             END
           ) as seconds
    FROM task_timesheet tt
    LEFT JOIN tasks t ON t.id = tt.task_id
    WHERE ${where}
    GROUP BY tt.employee_name, t.title, date
    ORDER BY date ASC
  `;
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const [rows] = await connection.execute(query, params);
    const totalSeconds = rows.reduce((s, r) => s + parseInt(r.seconds || 0, 10), 0);
    res.json({ items: rows, totalSeconds });
  } catch (err) {
    console.error('TimeLog query error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Consolidated Time Log Report - grouped by task (parent-level) and assignee across selected dates
app.get('/api/reports/timelog/consolidated', async (req, res) => {
  const { start, end, employee, department } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required (YYYY-MM-DD)' });

  // Build dynamic filters
  const params = [];
  let where = `tt.start_time >= ? AND tt.start_time < ?`;
  const startIso = `${start}T00:00:00.000Z`;
  const endIso = `${end}T23:59:59.999Z`;
  params.push(startIso, endIso);

  if (employee) {
    where += ` AND tt.employee_name = ?`;
    params.push(employee);
  }
  if (department) {
    where += ` AND t.department = ?`;
    params.push(department);
  }

  const query = `
    SELECT 
      tt.employee_name,
      t.title AS task_title,
      t.labels,
      t.priority,
      SUM(
        CASE 
          WHEN tt.hours_logged_seconds > 0 THEN tt.hours_logged_seconds
          WHEN tt.hours_logged > 0 THEN tt.hours_logged
          WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN 
            TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time)
          ELSE 0
        END
      ) as seconds
    FROM task_timesheet tt
    LEFT JOIN tasks t ON t.id = tt.task_id
    WHERE ${where}
    GROUP BY tt.employee_name, t.title, t.labels, t.priority
    ORDER BY seconds DESC
  `;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [rows] = await connection.execute(query, params);
    const totalSeconds = rows.reduce((s, r) => s + parseInt(r.seconds || 0, 10), 0);
    res.json({ items: rows, totalSeconds });
  } catch (err) {
    console.error('Consolidated TimeLog query error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Day summary across employees
app.get('/api/attendance/day-summary', async (req, res) => {
  const { date } = req.query; // YYYY-MM-DD
  const base = date ? new Date(date) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate()).toISOString();
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1).toISOString();

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT a.employee_id, e.name as employee_name,
             MIN(a.clock_in) as first_clock_in,
             MAX(a.clock_out) as last_clock_out,
             SUM(a.duration_seconds) as total_seconds
      FROM attendance a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE a.clock_in >= ? AND a.clock_in < ?
      GROUP BY a.employee_id
    `;

    const [rows] = await connection.execute(query, [start, end]);
    const [emps] = await connection.execute('SELECT id, name FROM employees');

      const presentIds = new Set(rows.map(r => r.employee_id));
      const notClockedIn = emps.filter(e => !presentIds.has(e.id));
    
      res.json({ date: start.slice(0,10), entries: rows, notClockedIn });
  } catch (err) {
    console.error('Error fetching day summary:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Errors APIs
app.get('/api/errors', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});
app.post('/api/errors', async (req, res) => {
  const { employee_id, task_id, severity, description, error_date } = req.body;
  if (!employee_id || !task_id || !severity) {
    return res.status(400).json({ error: 'employee_id, task_id and severity are required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Get employee name
    const [employees] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employees.length === 0) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    const employee_name = employees[0].name;
    
    // Insert error record
    const insert = `INSERT INTO errors (employee_id, employee_name, task_id, severity, description, error_date) VALUES (?, ?, ?, ?, ?, ?)`;
    const [result] = await connection.execute(insert, [employee_id, employee_name, task_id, severity, description || '', error_date || null]);
    
    // Get the created error record
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
    if (connection) {
      connection.release();
    }
  }
});

// Delete single error
app.delete('/api/errors/:id', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});
// Delete multiple errors
app.delete('/api/errors/bulk', async (req, res) => {
  console.log('Bulk delete request received:', req.body);
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    console.log('Invalid IDs array:', ids);
    return res.status(400).json({ error: 'IDs array is required' });
  }
  
  // Convert IDs to numbers to ensure proper comparison
  const numericIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }
  
  console.log('Deleting error IDs:', numericIds);
  const placeholders = numericIds.map(() => '?').join(',');
  const query = `DELETE FROM errors WHERE id IN (${placeholders})`;
  console.log('Delete query:', query);
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const [result] = await connection.execute(query, numericIds);
    console.log('Successfully deleted', result.affectedRows, 'error(s)');
    res.json({ 
      message: `${result.affectedRows} error(s) deleted successfully`,
      deletedCount: result.affectedRows 
    });
  } catch (err) {
      console.error('Error deleting errors:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Appreciations APIs
app.get('/api/appreciations', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/appreciations', async (req, res) => {
  const { employee_id, title, description, appreciation_date } = req.body;
  if (!employee_id || !title) {
    return res.status(400).json({ error: 'employee_id and title are required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Get employee name
    const [employees] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employees.length === 0) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    const employee_name = employees[0].name;
    
    // Insert appreciation record
    const insert = `INSERT INTO appreciations (employee_id, employee_name, title, description, appreciation_date) VALUES (?, ?, ?, ?, ?)`;
    const [result] = await connection.execute(insert, [employee_id, employee_name, title, description || '', appreciation_date || null]);
    
    // Get the created appreciation record
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
    if (connection) {
      connection.release();
    }
  }
});

// Delete single appreciation
app.delete('/api/appreciations/:id', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});
// Delete multiple appreciations (bulk delete)
app.delete('/api/appreciations/bulk', async (req, res) => {
  const { ids } = req.body;
  console.log('Bulk delete appreciations request - IDs:', ids);
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs array is required' });
  }
  
  // Convert IDs to numbers to ensure proper comparison
  const numericIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }
  
  const placeholders = numericIds.map(() => '?').join(',');
  const query = `DELETE FROM appreciations WHERE id IN (${placeholders})`;
  
  console.log('Bulk delete appreciations query:', query, 'with params:', numericIds);
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const [result] = await connection.execute(query, numericIds);
    console.log('Bulk delete appreciations result - affected rows:', result.affectedRows);
    res.json({ 
      message: `${result.affectedRows} appreciation(s) deleted successfully`,
      deletedCount: result.affectedRows 
    });
  } catch (err) {
      console.error('Error deleting appreciations:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Appreciation Types APIs
app.get('/api/appreciation-types', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});
app.post('/api/appreciation-types', async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
  const insert = 'INSERT INTO appreciation_types (name) VALUES (?)';
    const [result] = await connection.execute(insert, [String(name).trim()]);
    
    // Get the created appreciation type
    const [rows] = await connection.execute('SELECT id, name, status, created_at FROM appreciation_types WHERE id = ?', [result.insertId]);
    
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
    if (connection) {
      connection.release();
    }
  }
});

// Department dashboard aggregate
app.get('/api/departments/:id/dashboard', async (req, res) => {
  const deptId = req.params.id; // departments table uses numeric id; fallback to name lookup
  console.log('🔍 Department Dashboard API - Requested ID:', deptId, 'Type:', typeof deptId);
  let connection;
  
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // First, get department by id
    const [deptRows] = await connection.execute('SELECT * FROM departments WHERE id = ?', [deptId]);
    console.log('🔍 Department Dashboard API - Department rows found:', deptRows.length);
    
    const buildResponse = async (departmentName) => {
      // Employees in department
      const [employees] = await connection.execute('SELECT * FROM employees WHERE department = ?', [departmentName]);
      const totalEmployees = employees.length;
      
      // Count employees by designation (not user_role)
      const managerNames = employees.filter(e => (e.designation || '').toLowerCase().includes('manager')).map(e => e.name);
      const teamLeadNames = employees.filter(e => (e.designation || '').toLowerCase().includes('team leader')).map(e => e.name);
      const operatorNames = employees.filter(e => {
        const designation = (e.designation || '').toLowerCase();
        return !designation.includes('manager') && !designation.includes('team leader');
      }).map(e => e.name);

      // Calculate total cost: hourly_rate × monthly hours (26 working days)
      const totalCost = employees.reduce((sum, emp) => {
        const hourlyRate = Number(emp.hourly_rate) || 0;
        let monthlyHours = 0;
        
        // Calculate monthly hours based on employment type
        if (emp.employment_type === 'Full-time') {
          // 8 hours × 26 working days per month
          monthlyHours = 8 * 26;
        } else if (emp.employment_type === 'Part-time') {
          // Assume 4 hours per day for part-time, 4 × 26 working days
          monthlyHours = 4 * 26;
        } else {
          // Default to 8 hours × 26 working days
          monthlyHours = 8 * 26;
        }
        
        return sum + (hourlyRate * monthlyHours);
      }, 0);

      // Calculate total assigned hours for the department
      const assignedHours = employees.reduce((sum, emp) => {
        let monthlyHours = 0;
        
        if (emp.employment_type === 'Full-time') {
          monthlyHours = 8 * 26;
        } else if (emp.employment_type === 'Part-time') {
          monthlyHours = 4 * 26;
        } else {
          monthlyHours = 8 * 26;
        }
        
        return sum + monthlyHours;
      }, 0);

      // Tasks aggregates
      const [tasks] = await connection.execute('SELECT * FROM tasks WHERE department = ?', [departmentName]);
      const totalCompleted = tasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
      
      // Count tasks by labels (Daily Task, Weekly Task, Monthly Task)
      const totalDaily = tasks.filter(t => (t.labels || '').toLowerCase().includes('daily task')).length;
      const totalWeekly = tasks.filter(t => (t.labels || '').toLowerCase().includes('weekly task')).length;
      const totalMonthly = tasks.filter(t => (t.labels || '').toLowerCase().includes('monthly task')).length;
      
      // Count pending tasks excluding daily/weekly/monthly tasks
      const totalPendingExclDWM = tasks.filter(t => {
        const status = (t.status || '').toLowerCase();
        const labels = (t.labels || '').toLowerCase();
        return status !== 'completed' && 
               !labels.includes('daily task') && 
               !labels.includes('weekly task') && 
               !labels.includes('monthly task');
      }).length;

      const responseData = {
        totalEmployees,
        managerCount: managerNames.length,
        managerNames,
        teamLeadCount: teamLeadNames.length,
        teamLeadNames,
        operatorCount: operatorNames.length,
        operatorNames,
        totalCost: Math.round(totalCost), // Round to whole number
        assignedHours: Math.round(assignedHours), // Round to whole number
        totalDaily,
        totalWeekly,
        totalMonthly,
        totalPendingExclDWM,
        totalCompleted
      };
      
      console.log('🔍 Department Dashboard API - Response data:', responseData);
      res.json(responseData);
    };

    if (deptRows.length > 0) {
      console.log('🔍 Department Dashboard API - Found department by ID:', deptRows[0].name);
      return await buildResponse(deptRows[0].name);
    }
    
    // If not by id, try by name directly
    console.log('🔍 Department Dashboard API - Trying to find by name:', deptId);
    const [byNameRows] = await connection.execute('SELECT name FROM departments WHERE name = ?', [deptId]);
    console.log('🔍 Department Dashboard API - Found by name:', byNameRows.length);
    if (byNameRows.length === 0) {
      console.log('🔍 Department Dashboard API - Department not found');
      return res.status(404).json({ error: 'Department not found' });
    }
    
    await buildResponse(byNameRows[0].name);
    
  } catch (err) {
    console.error('Error in department dashboard:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Get all employees
            app.get('/api/employees', async (req, res) => {
  // Check if all employees are requested (for task assignment)
  const getAll = req.query.all === 'true';
  const { department, designation } = req.query;
  
  let query, countQuery, params;
  let whereClause = '';
  let whereParams = [];
  
  // Build WHERE clause for filters
  if (department) {
    whereClause += ' WHERE department = ?';
    whereParams.push(department);
  }
  
  if (designation) {
    if (whereClause) {
      whereClause += ' AND LOWER(designation) LIKE ?';
    } else {
      whereClause += ' WHERE LOWER(designation) LIKE ?';
    }
    whereParams.push(`%${designation.toLowerCase()}%`);
  }
  
  if (getAll) {
    // Return all employees for task assignment
    if (whereClause) {
      query = `SELECT * FROM employees${whereClause} AND status = "Active" ORDER BY name ASC`;
      countQuery = `SELECT COUNT(*) as total FROM employees${whereClause} AND status = "Active"`;
    } else {
      query = 'SELECT * FROM employees WHERE status = "Active" ORDER BY name ASC';
      countQuery = 'SELECT COUNT(*) as total FROM employees WHERE status = "Active"';
    }
    params = whereParams;
  } else {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    // NOTE: LIMIT and OFFSET cannot use placeholders in MySQL prepared statements
    // Insert values directly into query (safe because we've validated them as integers)
    const safeLimit = parseInt(limit, 10);
    const safeOffset = parseInt(offset, 10);
    query = `SELECT * FROM employees${whereClause} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    countQuery = `SELECT COUNT(*) as total FROM employees${whereClause}`;
    params = [...whereParams]; // Don't include limit/offset in params
  }
              let connection;
              
              try {
                // Get a connection from the pool
                connection = await mysqlPool.getConnection();
                
                // Check connection health
                await connection.ping();
                
                // Execute both queries in parallel
                const [results, countResult] = await Promise.all([
                  connection.execute(query, params),
                  connection.execute(countQuery, whereParams)
                ]);
                
                const total = countResult[0][0].total;
                
                if (getAll) {
                  // Return all employees without pagination
                  res.json({
                    data: results[0],
                    pagination: {
                      page: 1,
                      limit: total,
                      total,
                      totalPages: 1,
                      hasNext: false,
                      hasPrev: false
                    }
                  });
                } else {
                  // Pagination parameters
                  const page = parseInt(req.query.page) || 1;
                  const limit = parseInt(req.query.limit) || 50;
                  const totalPages = Math.ceil(total / limit);
                  res.json({
                    data: results[0],
                    pagination: {
                      page,
                      limit,
                      total,
                      totalPages,
                      hasNext: page < totalPages,
                      hasPrev: page > 1
                    }
                  });
                }
                
              } catch (err) {
      console.error('Error fetching employees:', err);
                
                // Check if it's a connection error
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
      res.status(500).json({ error: 'Database error' });
                }
              } finally {
                // Always release the connection back to the pool
                if (connection) {
                  connection.release();
                }
              }
});

// Get employee statistics
app.get('/api/employees/stats', async (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM employees',
    managers: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%manager%"',
    teamLeaders: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%team%" AND LOWER(designation) LIKE "%leader%"',
    operators: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%operator%"',
    staff: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(designation) LIKE "%staff%"',
    admin: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(user_role) = "admin" OR LOWER(designation) LIKE "%admin%"',
    officeEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(work_from) = "office"',
    remoteEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(work_from) = "remote"',
    fullTimeEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(employment_type) = "full-time"',
    partTimeEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(employment_type) = "part-time"',
    internEmployees: 'SELECT COUNT(*) as count FROM employees WHERE LOWER(employment_type) = "intern"'
  };

  let connection;
  try {
    // Get a connection from the pool
    connection = await mysqlPool.getConnection();
    
    // Check connection health
    await connection.ping();

  const stats = {};
    
    // Execute all queries in parallel for better performance
    const promises = Object.keys(queries).map(async (key) => {
      try {
        const [results] = await connection.execute(queries[key]);
        stats[key] = results[0].count;
      } catch (err) {
        console.error(`Error fetching ${key} stats:`, err);
        stats[key] = 0;
      }
    });

    // Wait for all queries to complete
    await Promise.all(promises);
    
        res.json(stats);
    
  } catch (err) {
    console.error('Error in employee statistics:', err);
    
    // Check if it's a connection error
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.error('MySQL connection lost, attempting to reconnect...');
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});

// Debug endpoint to see employee data
app.get('/api/employees/debug', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = 'SELECT id, name, designation, work_from, employment_type FROM employees LIMIT 10';
    const [results] = await connection.execute(query);
    res.json(results);
  } catch (err) {
    console.error('Error fetching debug data:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Get employee health score
app.get('/api/employees/:id/health', async (req, res) => {
  const employeeId = req.params.id;
  const today = new Date();
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Get health settings from database
    const healthSettings = await getHealthSettings(connection);
    
    // Calculate two health cycles using dynamic settings:
    // 1. HR Cycle: Last N months from 1st of month to last date of Nth month
    // 2. Task Management Cycle: Last N months from X days earlier from today
    
    // HR Cycle: From 1st of month to last date of Nth month
    const hrCycleStart = new Date();
    hrCycleStart.setDate(1); // First day of current month
    hrCycleStart.setMonth(hrCycleStart.getMonth() - healthSettings.hr_cycle_months); // Go back N months
    
    const hrCycleEnd = new Date(); // Include current month
    
    // Data Cycle: Broader range for errors, appreciations, and general data
    // This includes current month data that might not be in the HR cycle
    const dataCycleStart = new Date();
    dataCycleStart.setMonth(dataCycleStart.getMonth() - healthSettings.data_cycle_months); // Go back N months
    
    const dataCycleEnd = new Date(); // Up to today
    dataCycleEnd.setDate(dataCycleEnd.getDate() + 1); // Include today's data
    
    // Task Management Cycle: From X days earlier from today, going back N months
    const taskCycleStart = new Date();
    taskCycleStart.setDate(taskCycleStart.getDate() - healthSettings.task_cycle_offset_days); // X days earlier from today
    taskCycleStart.setMonth(taskCycleStart.getMonth() - healthSettings.task_cycle_months); // Go back N months
    
    const taskCycleEnd = new Date();
    taskCycleEnd.setDate(taskCycleEnd.getDate() - healthSettings.task_cycle_offset_days); // X days earlier from today

    // Handle admin user case
    let employee;
    if (employeeId === 'admin') {
      // Create a mock employee object for admin user
      employee = {
        id: 'admin',
        name: 'Admin User',
        email: 'admin@daataadirect.co.uk',
        working_hours: 8, // Default working hours
        user_role: 'admin'
      };
    } else {
      // Get employee data from database
      const employeeQuery = 'SELECT * FROM employees WHERE id = ?';
      const [employeeRows] = await connection.execute(employeeQuery, [employeeId]);
      
      if (employeeRows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      employee = employeeRows[0];
    }
    
    // Get the employee_id string for attendance/errors/appreciations queries
    // Note: attendance table stores employee_id as the integer ID converted to string
    // errors and appreciations tables store employee_id as integer
    // For admin user, use a special identifier that won't match any real employee
    const employeeIdString = employeeId === 'admin' ? 'admin' : employeeId.toString(); // Use integer ID as string for attendance
    const employeeIdInt = employeeId === 'admin' ? -1 : employeeId; // Use -1 for admin, integer ID for others
    
    console.log('Employee ID from URL:', employeeId);
    console.log('Employee ID as string:', employeeIdString);
    console.log('Employee ID as int:', employeeIdInt);
      
    // Debug: Check if tables have any data
    console.log('Checking table contents for debugging...');
    console.log('HR Cycle dates (Working Hours):', { start: hrCycleStart.toISOString(), end: hrCycleEnd.toISOString() });
    console.log('Data Cycle dates (Errors/Appreciations):', { start: dataCycleStart.toISOString(), end: dataCycleEnd.toISOString() });
    console.log('Employee ID from URL:', employeeId);
    console.log('Employee ID type:', typeof employeeId);
    
    // Check if this employee ID exists in the database
    const [empRows] = await connection.execute('SELECT id, employee_id, name FROM employees WHERE id = ?', [employeeId]);
    if (empRows.length > 0) {
      console.log('Found employee:', empRows[0]);
    } else {
      console.log('No employee found with id:', employeeId);
      // Try to find by employee_id field
      const [emp2Rows] = await connection.execute('SELECT id, employee_id, name FROM employees WHERE employee_id = ?', [employeeId]);
      if (emp2Rows.length > 0) {
        console.log('Found employee by employee_id field:', emp2Rows[0]);
      } else {
        console.log('No employee found with employee_id:', employeeId);
      }
    }
      
    console.log('Employee found:', { id: employee.id, name: employee.name });
    
    let healthScore = 0;
    const calculations = {
      tasks: { completed: 0, total: 0, score: 0 },
      hours: { provided: 0, required: 0, score: 0 },
      errors: { high: 0, medium: 0, low: 0, score: 0 },
      appreciations: { count: 0, score: 0 },
      attendance: { absences: 0, score: 0 },
      warningLetters: { high: 0, medium: 0, low: 0, score: 0 }
    };
    
    // Handle admin user - return default health data without database queries
    if (employeeId === 'admin') {
      const adminHealthData = {
        employee: employee,
        healthScore: 0,
        calculations: calculations,
        healthSettings: healthSettings,
        cycles: {
          hr: { start: hrCycleStart, end: hrCycleEnd },
          data: { start: dataCycleStart, end: dataCycleEnd },
          task: { start: taskCycleStart, end: taskCycleEnd }
        },
        message: 'Admin user - no health data available'
      };
      
      return res.json(adminHealthData);
    }
    
    // Calculate expected working hours per day
    const expectedHoursPerDay = parseFloat(employee.working_hours) || healthSettings.expected_hours_per_day;
    
    await Promise.all([
      // 1. Calculate task completion score (using DWM report data)
      new Promise(async (resolve) => {
        const assignedToPattern = `%${employee.name}%`;
        const startDateStr = taskCycleStart.toISOString().split('T')[0];
        const endDateStr = taskCycleEnd.toISOString().split('T')[0];
        
        console.log('Fetching DWM report data for:', employee.name);
        console.log('Task cycle dates:', startDateStr, 'to', endDateStr);
        
        // Get DWM completion data AND total tasks for each day
        const dwmQuery = `
          WITH RECURSIVE dates AS (
            SELECT DATE(?) as day
            UNION ALL
            SELECT DATE_ADD(day, INTERVAL 1 DAY)
            FROM dates
            WHERE day <= DATE(?)
          )
          SELECT 
            d.day,
            COALESCE(SUM(CASE WHEN lower(t.labels) LIKE '%daily%' THEN 1 ELSE 0 END), 0) as daily_total,
            COALESCE(SUM(CASE WHEN (
              t.title LIKE '%(Monday)%' AND DAYOFWEEK(d.day) = 2 OR
              t.title LIKE '%(Tuesday)%' AND DAYOFWEEK(d.day) = 3 OR
              t.title LIKE '%(Wednesday)%' AND DAYOFWEEK(d.day) = 4 OR
              t.title LIKE '%(Thursday)%' AND DAYOFWEEK(d.day) = 5 OR
              t.title LIKE '%(Friday)%' AND DAYOFWEEK(d.day) = 6 OR
              t.title LIKE '%(Saturday)%' AND DAYOFWEEK(d.day) = 7 OR
              t.title LIKE '%(Sunday)%' AND DAYOFWEEK(d.day) = 1
            ) THEN 1 ELSE 0 END), 0) as weekly_total,
            COALESCE(SUM(CASE WHEN (
              t.title LIKE '%(5 of month)%' AND DAY(d.day) = 5 OR
              t.title LIKE '%(10 of month)%' AND DAY(d.day) = 10 OR
              t.title LIKE '%(15 of month)%' AND DAY(d.day) = 15 OR
              t.title LIKE '%(20 of month)%' AND DAY(d.day) = 20 OR
              t.title LIKE '%(25 of month)%' AND DAY(d.day) = 25 OR
              t.title LIKE '%(30 of month)%' AND DAY(d.day) = 30
            ) THEN 1 ELSE 0 END), 0) as monthly_total,
            COALESCE(SUM(CASE WHEN lower(t.labels) LIKE '%daily%' AND th.new_value = 'Completed' THEN 1 ELSE 0 END), 0) as daily_completed,
            COALESCE(SUM(CASE WHEN (
              t.title LIKE '%(Monday)%' AND DAYOFWEEK(d.day) = 2 OR
              t.title LIKE '%(Tuesday)%' AND DAYOFWEEK(d.day) = 3 OR
              t.title LIKE '%(Wednesday)%' AND DAYOFWEEK(d.day) = 4 OR
              t.title LIKE '%(Thursday)%' AND DAYOFWEEK(d.day) = 5 OR
              t.title LIKE '%(Friday)%' AND DAYOFWEEK(d.day) = 6 OR
              t.title LIKE '%(Saturday)%' AND DAYOFWEEK(d.day) = 7 OR
              t.title LIKE '%(Sunday)%' AND DAYOFWEEK(d.day) = 1
            ) AND th.new_value = 'Completed' THEN 1 ELSE 0 END), 0) as weekly_completed,
            COALESCE(SUM(CASE WHEN (
              t.title LIKE '%(5 of month)%' AND DAY(d.day) = 5 AND th.new_value = 'Completed' OR
              t.title LIKE '%(10 of month)%' AND DAY(d.day) = 10 AND th.new_value = 'Completed' OR
              t.title LIKE '%(15 of month)%' AND DAY(d.day) = 15 AND th.new_value = 'Completed' OR
              t.title LIKE '%(20 of month)%' AND DAY(d.day) = 20 AND th.new_value = 'Completed' OR
              t.title LIKE '%(25 of month)%' AND DAY(d.day) = 25 AND th.new_value = 'Completed' OR
              t.title LIKE '%(30 of month)%' AND DAY(d.day) = 30 AND th.new_value = 'Completed'
            ) THEN 1 ELSE 0 END), 0) as monthly_completed
          FROM dates d
          LEFT JOIN tasks t ON t.assigned_to LIKE ?
          LEFT JOIN task_history th ON DATE(th.created_at) = d.day AND th.action = 'Status changed' AND th.task_id = t.id
          GROUP BY d.day
          ORDER BY d.day ASC
        `;
        
        try {
          const [dwmData] = await connection.execute(dwmQuery, [startDateStr, endDateStr, assignedToPattern]);
          
          console.log(`Found DWM data for ${dwmData.length} days`);
          
          // Calculate total days in the cycle (should be 93 days from May 9 to Aug 9)
          const startDate = new Date(startDateStr);
          const endDate = new Date(endDateStr);
          const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
          
          console.log(`Total days in cycle: ${totalDays} (from ${startDateStr} to ${endDateStr})`);
          
          // Count days where ALL required task types are completed
          let daysCompleted = 0;
          
          dwmData.forEach(dayRow => {
            const day = dayRow.day;
            const dailyTotal = dayRow.daily_total || 0;
            const weeklyTotal = dayRow.weekly_total || 0;
            const monthlyTotal = dayRow.monthly_total || 0;
            const dailyCompleted = dayRow.daily_completed || 0;
            const weeklyCompleted = dayRow.weekly_completed || 0;
            const monthlyCompleted = dayRow.monthly_completed || 0;
            
            // Day is completed if ALL required task types are completed
            let dayCompleted = true;
            
            // Check daily tasks - if any exist, they must ALL be completed
            if (dailyTotal > 0 && dailyCompleted < dailyTotal) {
              dayCompleted = false;
            }
            
            // Check weekly tasks - if any exist, they must ALL be completed
            if (weeklyTotal > 0 && weeklyCompleted < weeklyTotal) {
              dayCompleted = false;
            }
            
            // Check monthly tasks - if any exist, they must ALL be completed
            if (monthlyTotal > 0 && monthlyCompleted < monthlyTotal) {
              dayCompleted = false;
            }
            
            // Additional check: if there are no tasks for this day, don't count it
            if (dailyTotal === 0 && weeklyTotal === 0 && monthlyTotal === 0) {
              dayCompleted = false;
            }
            
            if (dayCompleted) {
              daysCompleted++;
              console.log(`✅ Day ${day} completed: Daily ${dailyCompleted}/${dailyTotal}, Weekly ${weeklyCompleted}/${weeklyTotal}, Monthly ${monthlyCompleted}/${monthlyTotal}`);
            } else {
              console.log(`❌ Day ${day} NOT completed: Daily ${dailyCompleted}/${dailyTotal}, Weekly ${weeklyCompleted}/${weeklyTotal}, Monthly ${monthlyCompleted}/${monthlyTotal}`);
            }
          });
          
          const score = daysCompleted * healthSettings.task_points_per_day;
          console.log(`Task completion: ${daysCompleted}/${totalDays} days, Score: ${score}`);
          
          calculations.tasks = {
            completed: daysCompleted,
            total: totalDays,
            score: score
          };
          
          resolve();
        } catch (err) {
          console.error('Error fetching DWM data:', err);
          console.error('Error details:', err.message);
          console.error('Error stack:', err.stack);
          
          // Set default values when there's an error
          calculations.tasks = {
            completed: 0,
            total: 0,
            score: 0
          };
          
          resolve();
        }
      }),
      
      // 2. Calculate working hours score (HR Cycle)
      new Promise(async (resolve) => {
        // Calculate actual working hours from duration_seconds or clock_in/clock_out times
        const hoursQuery = `
          SELECT 
            DATE_FORMAT(date, '%Y-%m') as month,
            SUM(CASE 
              WHEN duration_seconds > 0 THEN duration_seconds / 3600.0
              WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL 
              THEN (UNIX_TIMESTAMP(clock_out) - UNIX_TIMESTAMP(clock_in)) / 3600.0
              ELSE 0 
            END) as monthly_hours
          FROM attendance 
          WHERE employee_id = ? 
          AND DATE(date) >= ? 
          AND DATE(date) <= ?
          GROUP BY DATE_FORMAT(date, '%Y-%m')
          ORDER BY month
        `;
        
        const startDateStr = hrCycleStart.toISOString().split('T')[0];
        const endDateStr = hrCycleEnd.toISOString().split('T')[0];
        
        console.log('Fetching attendance for employee:', employeeIdString, 'from', startDateStr, 'to', endDateStr);
        
        try {
          console.log('Executing hours query with params:', [employeeIdString, startDateStr, endDateStr]);
          const [attendance] = await connection.execute(hoursQuery, [employeeIdString, startDateStr, endDateStr]);
          
          console.log('Found attendance records:', attendance.length);
          console.log('Attendance data:', attendance);
          
          // If no attendance data found, use empty array (no fake data)
          if (attendance.length === 0) {
            console.log('❌ No attendance data found for employee:', employeeIdString);
            console.log('This means the SQL query returned no results');
          } else {
            console.log('✅ Found attendance data for employee:', employeeIdString);
          }
          
          let hoursScore = 0;
          let totalProvidedHours = 0;
          let totalRequiredHours = 0;
          let monthlyBreakdown = [];
          
          // Calculate for each month in the HR cycle (N-month period)
          console.log(`Starting monthly calculation loop for ${healthSettings.hr_cycle_months} months...`);
          for (let i = 0; i < healthSettings.hr_cycle_months; i++) {
            // Create a fresh date object for each month to avoid mutation issues
            const monthStart = new Date(hrCycleStart.getFullYear(), hrCycleStart.getMonth() + i, 1);
            monthStart.setHours(0, 0, 0, 0); // Set to start of day (midnight)
            
            const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
            monthEnd.setHours(23, 59, 59, 999); // Set to end of day
            
            console.log(`Month ${i + 1}: ${monthStart.toLocaleDateString()} to ${monthEnd.toLocaleDateString()}`);
            
            // Count working days in the month based on settings
            let workingDays = 0;
            for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
              const dayOfWeek = d.getDay();
              if (dayOfWeek >= 1 && dayOfWeek <= healthSettings.working_days_per_week) { // Monday to Saturday (or configured days)
                workingDays++;
              }
            }
            
            const requiredHoursForMonth = workingDays * expectedHoursPerDay;
            totalRequiredHours += requiredHoursForMonth;
            
            // Get the provided hours for this month from the monthly attendance data
            const monthKey = `${monthStart.getFullYear()}-${(monthStart.getMonth() + 1).toString().padStart(2, '0')}`; // YYYY-MM format
            const monthData = attendance.find(a => a.month === monthKey);
            const providedHoursForMonth = monthData ? parseFloat(monthData.monthly_hours) : 0;
            totalProvidedHours += providedHoursForMonth;
            
            // Calculate points for this month - configurable points if completed
            let monthPoints = 0;
            if (providedHoursForMonth >= requiredHoursForMonth) {
              monthPoints = healthSettings.hours_points_per_month; // Configurable points per month when full hours provided
              hoursScore += monthPoints;
            } else {
              monthPoints = 0; // 0 points when insufficient hours
            }
            
            // Add monthly breakdown
            const monthlyData = {
              month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
              required: requiredHoursForMonth,
              provided: providedHoursForMonth,
              points: monthPoints
            };
            monthlyBreakdown.push(monthlyData);
            console.log(`Added monthly data:`, monthlyData);
            
            console.log(`Month ${monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}: Required ${requiredHoursForMonth.toFixed(2)}h, Provided ${providedHoursForMonth.toFixed(2)}h, Working days: ${workingDays}, Points: ${monthPoints}`);
            console.log('Monthly breakdown data:', { month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), required: requiredHoursForMonth, provided: providedHoursForMonth, points: monthPoints });
          }
          
          calculations.hours = {
            provided: totalProvidedHours,
            required: totalRequiredHours,
            score: hoursScore,
            monthlyBreakdown: monthlyBreakdown
          };
          
          console.log('Final hours calculations:', calculations.hours);
          resolve();
        } catch (err) {
          console.error('Error fetching attendance:', err);
          console.error('Error details:', err.message);
          console.error('Error stack:', err.stack);
          
          // Set default values when there's an error
          calculations.hours = {
            provided: 0,
            required: 0,
            score: 0,
            monthlyBreakdown: []
          };
          
          resolve();
        }
      }),
      
      // 3. Calculate error deductions
      new Promise(async (resolve) => {
        const errorQuery = `
          SELECT severity, COUNT(*) as count
          FROM errors 
          WHERE employee_id = ? 
          AND created_at >= ? 
          AND created_at <= ?
          GROUP BY severity
        `;
        
        const startDateStr = dataCycleStart.toISOString();
        const endDateStr = dataCycleEnd.toISOString();
        
        console.log('Fetching errors for employee:', employeeIdString, 'from', startDateStr, 'to', endDateStr);
        
        try {
          const [errors] = await connection.execute(errorQuery, [employeeIdInt, startDateStr, endDateStr]);
          
          console.log('Found errors:', errors);
          console.log('Error query params:', { employeeId: employeeIdInt, startDateStr, endDateStr });
          
          let errorDeduction = 0;
          let highErrors = 0, mediumErrors = 0, lowErrors = 0;
          
          if (errors && errors.length > 0) {
            errors.forEach(error => {
              console.log('Processing error:', error);
              if (error.severity === 'High') {
                highErrors = error.count;
                errorDeduction += error.count * healthSettings.error_high_deduction;
              } else if (error.severity === 'Medium') {
                mediumErrors = error.count;
                errorDeduction += error.count * healthSettings.error_medium_deduction;
              } else if (error.severity === 'Low') {
                lowErrors = error.count;
                errorDeduction += error.count * healthSettings.error_low_deduction;
              }
            });
          } else {
            console.log('No errors found for employee:', employeeId);
          }
          
          console.log('Error calculation result:', { highErrors, mediumErrors, lowErrors, errorDeduction });
          
          calculations.errors = {
            high: highErrors,
            medium: mediumErrors,
            low: lowErrors,
            score: -errorDeduction
          };
          
          resolve();
        } catch (err) {
          console.error('Error fetching errors:', err);
          console.error('Error details:', err.message);
          console.error('Error stack:', err.stack);
          
          // Set default values when there's an error
          calculations.errors = {
            high: 0,
            medium: 0,
            low: 0,
            score: 0
          };
          
          resolve();
        }
      }),
      
      // 4. Calculate appreciation bonus
      new Promise(async (resolve) => {
        const appreciationQuery = `
          SELECT COUNT(*) as count
          FROM appreciations 
          WHERE employee_id = ? 
          AND created_at >= ? 
          AND created_at <= ?
        `;
        
        const startDateStr = dataCycleStart.toISOString();
        const endDateStr = dataCycleEnd.toISOString();
        
        try {
          const [result] = await connection.execute(appreciationQuery, [employeeIdInt, startDateStr, endDateStr]);
          
          console.log('Appreciation query result:', result);
          console.log('Appreciation query params:', { employeeId: employeeIdInt, startDateStr, endDateStr });
          
          const appreciationCount = result && result.length > 0 ? result[0].count : 0;
          const appreciationScore = appreciationCount * healthSettings.appreciation_bonus;
          
          console.log('Appreciation calculation:', { count: appreciationCount, score: appreciationScore });
          
          calculations.appreciations = {
            count: appreciationCount,
            score: appreciationScore
          };
          
          resolve();
        } catch (err) {
          console.error('Error fetching appreciations:', err);
          console.error('Appreciation error details:', err.message);
          console.error('Error stack:', err.stack);
          
          // Set default values when there's an error
          calculations.appreciations = {
            count: 0,
            score: 0
          };
          
          resolve();
        }
      }),
      
      // 5. Calculate attendance deductions
      new Promise(async (resolve) => {
        const absenceQuery = `
          SELECT 
            DATE_FORMAT(date, '%Y-%m') as month,
            COUNT(*) as days_present
          FROM attendance 
          WHERE employee_id = ? 
          AND date >= ? 
          AND date <= ?
          GROUP BY DATE_FORMAT(date, '%Y-%m')
        `;
        
        const startDateStr = hrCycleStart.toISOString().split('T')[0];
        const endDateStr = hrCycleEnd.toISOString().split('T')[0];
        
        try {
          const [attendance] = await connection.execute(absenceQuery, [employeeIdString, startDateStr, endDateStr]);
          
          console.log('Attendance query result:', attendance);
          console.log('Attendance query params:', { employeeId: employeeIdString, startDateStr, endDateStr });
          
          let attendanceDeduction = 0;
          let totalAbsences = 0;
          
          // Calculate for each month
          for (let i = 0; i < healthSettings.hr_cycle_months; i++) {
            const monthStart = new Date(hrCycleStart);
            monthStart.setMonth(monthStart.getMonth() + i);
            const monthKey = monthStart.toISOString().substring(0, 7); // YYYY-MM format
            
            // Count working days in the month
            const monthEnd = new Date(monthStart);
            monthEnd.setMonth(monthEnd.getMonth() + 1);
            monthEnd.setDate(0);
            
            let workingDays = 0;
            for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
              const dayOfWeek = d.getDay();
              if (dayOfWeek >= 1 && dayOfWeek <= healthSettings.working_days_per_week) { // Monday to Saturday (or configured days)
                workingDays++;
              }
            }
            
            const monthAttendance = attendance.find(a => a.month === monthKey);
            const daysPresent = monthAttendance ? monthAttendance.days_present : 0;
            const absences = workingDays - daysPresent;
            
            totalAbsences += absences;
            
            // If more than configured absences in a month, deduct configured points
            if (absences > healthSettings.max_absences_per_month) {
              attendanceDeduction += healthSettings.attendance_deduction;
            }
          }
          
          calculations.attendance = {
            absences: totalAbsences,
            score: -attendanceDeduction
          };
          
          resolve();
        } catch (err) {
          console.error('Error fetching warning letters:', err);
          console.error('Warning letters error details:', err.message);
          console.error('Error stack:', err.stack);
          
          // Set default values when there's an error
          calculations.warningLetters = {
            high: 0,
            medium: 0,
            low: 0,
            score: 0
          };
          
          resolve();
        }
      })
    ]).then(() => {
      // Calculate total health score
      healthScore = calculations.tasks.score + 
                    calculations.hours.score + 
                    calculations.errors.score + 
                    calculations.appreciations.score + 
                    calculations.attendance.score +
                    calculations.warningLetters.score;
      
      // Determine rating using dynamic thresholds
      let rating, ratingColor;
      if (healthScore >= healthSettings.top_rated_threshold) {
        rating = 'TOP RATED EMPLOYEE';
        ratingColor = 'green';
      } else if (healthScore >= healthSettings.average_threshold) {
        rating = 'AVERAGE EMPLOYEE';
        ratingColor = 'orange';
      } else {
        rating = 'BELOW STANDARD EMPLOYEE';
        ratingColor = 'red';
      }
      
      res.json({
        employeeId: employeeId,
        employeeName: employee.name,
        healthScore: healthScore,
        rating: rating,
        ratingColor: ratingColor,
        calculations: calculations,
        period: {
          start: hrCycleStart.toISOString().split('T')[0],
          end: hrCycleEnd.toISOString().split('T')[0]
        },
        cycles: {
          hr: {
            start: hrCycleStart.toISOString().split('T')[0],
            end: hrCycleEnd.toISOString().split('T')[0],
            description: 'HR Cycle: Working Hours, Errors, Appreciations, Attendance'
          },
          task: {
            start: taskCycleStart.toISOString().split('T')[0],
            end: taskCycleEnd.toISOString().split('T')[0],
            description: 'Task Management Cycle: Task Completion'
          }
        }
      });
    }).catch((err) => {
      console.error('Error in Promise.all:', err);
      res.status(500).json({ error: 'Database error' });
    });
  } catch (err) {
    console.error('Error calculating health score:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Get employee by ID
app.get('/api/employees/:id', async (req, res) => {
  const query = 'SELECT * FROM employees WHERE id = ?';
  let connection;
  
  try {
    // Get a connection from the pool
    connection = await mysqlPool.getConnection();
    
    // Check connection health
    await connection.ping();
    
    const [results] = await connection.execute(query, [req.params.id]);
    
    if (results.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    res.json(results[0]);
    
  } catch (err) {
    console.error('Error fetching employee:', err);
    
    // Check if it's a connection error
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.error('MySQL connection lost, attempting to reconnect...');
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});
// Create new employee
app.post('/api/employees', async (req, res) => {
  const employeeData = req.body;

  // Basic validation
  if (!employeeData.name || !employeeData.email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const query = `
    INSERT INTO employees (
      employee_id, salutation, name, email, password, designation, 
      department, work_from, country, mobile, gender, joining_date, 
      date_of_birth, reporting_to, language, user_role, address, 
      about, photo, login_allowed, email_notifications, hourly_rate, 
      slack_member_id, skills, probation_end_date, notice_period_start_date, 
      notice_period_end_date, employment_type, marital_status, business_address,
      status, working_hours, job_title, emergency_contact_number, emergency_contact_relation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    employeeData.employee_id,
    employeeData.salutation,
    employeeData.name,
    employeeData.email,
    employeeData.password,
    employeeData.designation,
    employeeData.department,
    employeeData.work_from,
    employeeData.country,
    employeeData.mobile,
    employeeData.gender,
    employeeData.joining_date,
    employeeData.date_of_birth,
    employeeData.reporting_to,
    employeeData.language,
    employeeData.user_role,
    employeeData.address,
    employeeData.about,
    employeeData.photo,
    employeeData.login_allowed ? 1 : 0,
    employeeData.email_notifications ? 1 : 0,
    employeeData.hourly_rate,
    employeeData.slack_member_id,
    employeeData.skills,
    employeeData.probation_end_date,
    employeeData.notice_period_start_date,
    employeeData.notice_period_end_date,
    employeeData.employment_type,
    employeeData.marital_status,
    employeeData.business_address,
    employeeData.status || 'Active',
    employeeData.working_hours || 8,
    employeeData.job_title,
    employeeData.emergency_contact_number,
    employeeData.emergency_contact_relation
  ];
  
  let connection;
  try {
    // Get a connection from the pool
    connection = await mysqlPool.getConnection();
    
    // Check connection health
    await connection.ping();
    
    const [result] = await connection.execute(query, values);
    
    res.status(201).json({ 
      id: result.insertId,
      message: 'Employee created successfully' 
    });
    
  } catch (err) {
      console.error('Error creating employee:', err);
    
    // Check for unique constraint violations
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('employees.email')) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      if (err.message.includes('employees.employee_id')) {
        return res.status(400).json({ error: 'Employee ID already exists' });
      }
      return res.status(400).json({ error: 'Duplicate entry found' });
    }
    
    // Check if it's a connection error
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.error('MySQL connection lost, attempting to reconnect...');
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: err.message || 'Database error' });
    }
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});
// Update employee
app.put('/api/employees/:id', async (req, res) => {
  const employeeData = req.body;

  // Basic validation
  if (!employeeData.name || !employeeData.email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const query = `
    UPDATE employees SET 
      employee_id = ?, salutation = ?, name = ?, email = ?, password = ?, 
      designation = ?, department = ?, work_from = ?, country = ?, mobile = ?, 
      gender = ?, joining_date = ?, date_of_birth = ?, reporting_to = ?, 
      language = ?, user_role = ?, address = ?, about = ?, photo = ?, login_allowed = ?, 
      email_notifications = ?, hourly_rate = ?, slack_member_id = ?, skills = ?, 
      probation_end_date = ?, notice_period_start_date = ?, notice_period_end_date = ?, 
      employment_type = ?, marital_status = ?, business_address = ?,
      status = ?, working_hours = ?, job_title = ?, emergency_contact_number = ?, emergency_contact_relation = ?
    WHERE id = ?
  `;
  
  const values = [
    employeeData.employee_id,
    employeeData.salutation,
    employeeData.name,
    employeeData.email,
    employeeData.password,
    employeeData.designation,
    employeeData.department,
    employeeData.work_from,
    employeeData.country,
    employeeData.mobile,
    employeeData.gender,
    employeeData.joining_date,
    employeeData.date_of_birth,
    employeeData.reporting_to,
    employeeData.language,
    employeeData.user_role,
    employeeData.address,
    employeeData.about,
    employeeData.photo,
    employeeData.login_allowed ? 1 : 0,
    employeeData.email_notifications ? 1 : 0,
    employeeData.hourly_rate,
    employeeData.slack_member_id,
    employeeData.skills,
    employeeData.probation_end_date,
    employeeData.notice_period_start_date,
    employeeData.notice_period_end_date,
    employeeData.employment_type,
    employeeData.marital_status,
    employeeData.business_address,
    employeeData.status || 'Active',
    employeeData.working_hours || 8,
    employeeData.job_title,
    employeeData.emergency_contact_number,
    employeeData.emergency_contact_relation,
    req.params.id
  ];
  let connection;
  try {
    // Get a connection from the pool
    connection = await mysqlPool.getConnection();
    
    // Check connection health
    await connection.ping();
    
    const [result] = await connection.execute(query, values);
    
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    
    res.json({ message: 'Employee updated successfully' });
    
  } catch (err) {
      console.error('Error updating employee:', err);
    
    // Check for unique constraint violations
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message.includes('employees.email')) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      if (err.message.includes('employees.employee_id')) {
        return res.status(400).json({ error: 'Employee ID already exists' });
      }
      return res.status(400).json({ error: 'Duplicate entry found' });
    }
    
    // Check if it's a connection error
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.error('MySQL connection lost, attempting to reconnect...');
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: err.message || 'Database error' });
    }
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});

// Delete employee
app.delete('/api/employees/:id', async (req, res) => {
  const query = 'DELETE FROM employees WHERE id = ?';
  let connection;
  
  try {
    // Get a connection from the pool
    connection = await mysqlPool.getConnection();
    
    // Check connection health
    await connection.ping();
    
    const [result] = await connection.execute(query, [req.params.id]);
    
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    
    res.json({ message: 'Employee deleted successfully' });
    
  } catch (err) {
    console.error('Error deleting employee:', err);
    
    // Check if it's a connection error
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.error('MySQL connection lost, attempting to reconnect...');
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});

// Import employees from Excel file
app.post('/api/employees/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    console.log(`Processing ${data.length} rows from Excel file`);
    console.log('Sample data from first row:', data[0]);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Process data synchronously to ensure proper counting
    const processData = async () => {
      for (let index = 0; index < data.length; index++) {
        const row = data[index];
        
        try {
          const employeeData = {
            employee_id: row['Employee ID'] || row['employee_id'] || row['Employee ID*'] || '',
            salutation: row['Salutation'] || row['salutation'] || '',
            name: row['Name'] || row['name'] || row['Name*'] || '',
            email: row['Email'] || row['email'] || row['Email*'] || '',
            password: row['Password'] || row['password'] || '',
            designation: row['Designation'] || row['designation'] || '',
            department: row['Department'] || row['department'] || '',
            work_from: row['Work From'] || row['work_from'] || '',
            country: row['Country'] || row['country'] || '',
            mobile: row['Mobile'] || row['mobile'] || '',
            gender: row['Gender'] || row['gender'] || '',
            joining_date: row['Joining Date'] || row['joining_date'] || '',
            date_of_birth: row['Date of Birth'] || row['date_of_birth'] || '',
            reporting_to: row['Reporting To'] || row['reporting_to'] || '',
            language: row['Language'] || row['language'] || '',
            user_role: row['User Role'] || row['user_role'] || '',
            address: row['Address'] || row['address'] || '',
            about: row['About'] || row['about'] || '',
            login_allowed: row['Login Allowed'] || row['login_allowed'] || true,
            email_notifications: row['Email Notifications'] || row['email_notifications'] || true,
            hourly_rate: row['Hourly Rate'] || row['hourly_rate'] || row['Hourly Rate*'] || '',
            slack_member_id: row['Slack Member ID'] || row['slack_member_id'] || '',
            skills: row['Skills'] || row['skills'] || '',
            probation_end_date: row['Probation End Date'] || row['probation_end_date'] || '',
            notice_period_start_date: row['Notice Period Start Date'] || row['notice_period_start_date'] || '',
            notice_period_end_date: row['Notice Period End Date'] || row['notice_period_end_date'] || '',
            employment_type: row['Employment Type'] || row['employment_type'] || '',
            marital_status: row['Marital Status'] || row['marital_status'] || '',
            business_address: row['Business Address'] || row['business_address'] || '',
            working_hours: row['Working Hours'] || row['working_hours'] || '',
            job_title: row['Job Title'] || row['job_title'] || '',
            emergency_contact_number: row['Emergency Contact Number'] || row['emergency_contact_number'] || '',
            emergency_contact_relation: row['Emergency Contact Relation'] || row['emergency_contact_relation'] || '',
            status: row['Status'] || row['status'] || 'Active'
          };

          // Skip empty rows (if name and email are both empty)
          if (!employeeData.name || !employeeData.email) {
            console.log(`Skipping row ${index + 1}: Missing name or email`, employeeData);
            continue;
          }

          const query = `
            INSERT INTO employees (
              employee_id, salutation, name, email, password, designation, 
              department, work_from, country, mobile, gender, joining_date, 
              date_of_birth, reporting_to, language, user_role, address, 
              about, login_allowed, email_notifications, hourly_rate, 
              slack_member_id, skills, probation_end_date, notice_period_start_date, 
              notice_period_end_date, employment_type, marital_status, business_address,
              working_hours, job_title, emergency_contact_number, emergency_contact_relation, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const values = [
            employeeData.employee_id, employeeData.salutation, employeeData.name,
            employeeData.email, employeeData.password, employeeData.designation,
            employeeData.department, employeeData.work_from, employeeData.country,
            employeeData.mobile, employeeData.gender, employeeData.joining_date,
            employeeData.date_of_birth, employeeData.reporting_to, employeeData.language,
            employeeData.user_role, employeeData.address, employeeData.about,
            employeeData.login_allowed, employeeData.email_notifications, employeeData.hourly_rate,
            employeeData.slack_member_id, employeeData.skills, employeeData.probation_end_date,
            employeeData.notice_period_start_date, employeeData.notice_period_end_date,
            employeeData.employment_type, employeeData.marital_status, employeeData.business_address,
            employeeData.working_hours, employeeData.job_title, employeeData.emergency_contact_number,
            employeeData.emergency_contact_relation, employeeData.status
          ];
          // Use MySQL connection for import
          try {
            console.log(`Processing row ${index + 1}: ${employeeData.name} (${employeeData.email})`);
            
            const connection = await mysqlPool.getConnection();
            await connection.ping();
            
            const [result] = await connection.execute(query, values);
            console.log(`Row ${index + 1} inserted successfully, ID: ${result.insertId}`);
            successCount++;
            
            connection.release();
          } catch (err) {
                errorCount++;
                errors.push(`Row ${index + 1} (${employeeData.name || 'Unknown'}): ${err.message}`);
                console.log(`Import error for row ${index + 1}:`, err.message);
                console.log('Data being imported:', employeeData);
            console.log('MySQL Error Code:', err.code);
              }

        } catch (error) {
          errorCount++;
          errors.push(`Row ${index + 1}: ${error.message}`);
          console.log(`Processing error for row ${index + 1}:`, error.message);
        }
      }
    };

    await processData();

    res.json({
      message: `Import completed. ${successCount} employees imported successfully. ${errorCount} errors.`,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Error processing file' });
  }
});
// ===== DEPARTMENTS API ENDPOINTS =====

            // Get all departments
            app.get('/api/departments', cacheMiddleware('departments'), async (req, res) => {
              const query = 'SELECT * FROM departments ORDER BY created_at DESC';
              let connection;
              
              try {
                // Get a connection from the pool
                connection = await mysqlPool.getConnection();
                
                // Check connection health
                await connection.ping();
                
                const [results] = await connection.execute(query);
                res.json(results);
                
              } catch (err) {
                  console.error('Error fetching departments:', err);
                
                // Check if it's a connection error
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                // Always release the connection back to the pool
                if (connection) {
                  connection.release();
                }
              }
            });

            // Get department by ID
            app.get('/api/departments/:id', async (req, res) => {
              const query = 'SELECT * FROM departments WHERE id = ?';
              try {
                const [results] = await mysqlPool.execute(query, [req.params.id]);
                
                if (results.length === 0) {
                  res.status(404).json({ error: 'Department not found' });
                  return;
                }
                res.json(results[0]);
              } catch (err) {
                console.error('Error fetching department:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });

            // Create new department
            app.post('/api/departments', async (req, res) => {
              const departmentData = req.body;

              const query = `
                INSERT INTO departments (name, description, manager, location, status)
                VALUES (?, ?, ?, ?, ?)
              `;

              const values = [
                departmentData.name,
                departmentData.description,
                departmentData.manager,
                departmentData.location,
                departmentData.status || 'Active'
              ];

              try {
                const [result] = await mysqlPool.execute(query, values);
                
                res.status(201).json({
                  id: result.insertId,
                  message: 'Department created successfully'
                });
              } catch (err) {
                  console.error('Error creating department:', err);
                  res.status(500).json({ error: 'Database error' });
                }
            });

            // Update department
            app.put('/api/departments/:id', async (req, res) => {
              const departmentData = req.body;

              const query = `
                UPDATE departments SET
                  name = ?, description = ?, manager = ?, location = ?, status = ?
                WHERE id = ?
              `;

              const values = [
                departmentData.name,
                departmentData.description,
                departmentData.manager,
                departmentData.location,
                departmentData.status,
                req.params.id
              ];

              try {
                const [result] = await mysqlPool.execute(query, values);
                
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Department not found' });
                  return;
                }
                res.json({ message: 'Department updated successfully' });
              } catch (err) {
                console.error('Error updating department:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });

            // Delete department
            app.delete('/api/departments/:id', async (req, res) => {
              const query = 'DELETE FROM departments WHERE id = ?';
              let connection;
              
              try {
                // Get a connection from the pool
                connection = await mysqlPool.getConnection();
                
                // Check connection health
                await connection.ping();
                
                const [result] = await connection.execute(query, [req.params.id]);
                
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Department not found' });
                  return;
                }
                
                res.json({ message: 'Department deleted successfully' });
                
              } catch (err) {
                console.error('Error deleting department:', err);
                
                // Check if it's a connection error
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                // Always release the connection back to the pool
                if (connection) {
                  connection.release();
                }
              }
            });
            // Import departments from Excel file
            app.post('/api/departments/import', upload.single('file'), async (req, res) => {
              if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
              }

              try {
                const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(worksheet);

                if (data.length === 0) {
                  return res.status(400).json({ error: 'No data found in file' });
                }

                let successCount = 0;
                let errorCount = 0;
                const errors = [];
                let processedCount = 0;

                for (let index = 0; index < data.length; index++) {
                  const row = data[index];
                  const departmentData = {
                    name: row['Name'] || row['name'] || '',
                    description: row['Description'] || row['description'] || '',
                    manager: row['Manager'] || row['manager'] || '',
                    location: row['Location'] || row['location'] || '',
                    status: row['Status'] || row['status'] || 'Active'
                  };

                  // Validate required fields
                  if (!departmentData.name.trim()) {
                    errorCount++;
                    errors.push(`Row ${index + 1}: Department name is required`);
                    processedCount++;
                    if (processedCount === data.length) {
                      res.json({
                        message: `Import completed. ${successCount} departments imported successfully. ${errorCount} errors.`,
                        successCount,
                        errorCount,
                        errors: errors.length > 0 ? errors : undefined
                      });
                    }
                    continue;
                  }

                  const query = `
                    INSERT INTO departments (name, description, manager, location, status)
                    VALUES (?, ?, ?, ?, ?)
                  `;

                  const values = [
                    departmentData.name,
                    departmentData.description,
                    departmentData.manager,
                    departmentData.location,
                    departmentData.status
                  ];

                  // Process each row synchronously with MySQL
                  try {
                    await mysqlPool.execute(query, values);
                    successCount++;
                  } catch (err) {
                      errorCount++;
                      errors.push(`Row ${index + 1}: ${err.message}`);
                    }
                  
                  processedCount++;

                    // Send response when all rows are processed
                    if (processedCount === data.length) {
                      res.json({
                        message: `Import completed. ${successCount} departments imported successfully. ${errorCount} errors.`,
                        successCount,
                        errorCount,
                        errors: errors.length > 0 ? errors : undefined
                      });
                    }
                }

              } catch (error) {
                console.error('Error processing file:', error);
                res.status(500).json({ error: 'Error processing file' });
              }
            });

            // ===== DESIGNATIONS API ENDPOINTS =====

            // Get all designations
            app.get('/api/designations', async (req, res) => {
              const query = 'SELECT * FROM designations ORDER BY created_at DESC';
              try {
                const [results] = await mysqlPool.execute(query);
                res.json(results);
              } catch (err) {
                  console.error('Error fetching designations:', err);
                  res.status(500).json({ error: 'Database error' });
                }
            });

            // Get designation by ID
            app.get('/api/designations/:id', async (req, res) => {
              const query = 'SELECT * FROM designations WHERE id = ?';
              try {
                const [results] = await mysqlPool.execute(query, [req.params.id]);
                
                if (results.length === 0) {
                  res.status(404).json({ error: 'Designation not found' });
                  return;
                }
                res.json(results[0]);
              } catch (err) {
                console.error('Error fetching designation:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });

            // Create new designation
            app.post('/api/designations', async (req, res) => {
              const designationData = req.body;

              const query = `
                INSERT INTO designations (name, description, department, level, status)
                VALUES (?, ?, ?, ?, ?)
              `;

              const values = [
                designationData.name,
                designationData.description,
                designationData.department,
                designationData.level,
                designationData.status || 'Active'
              ];

              try {
                const [result] = await mysqlPool.execute(query, values);
                
                res.status(201).json({
                  id: result.insertId,
                  message: 'Designation created successfully'
                });
              } catch (err) {
                  console.error('Error creating designation:', err);
                  res.status(500).json({ error: 'Database error' });
                }
            });

            // Update designation
            app.put('/api/designations/:id', async (req, res) => {
              const designationData = req.body;

              const query = `
                UPDATE designations SET
                  name = ?, description = ?, department = ?, level = ?, status = ?
                WHERE id = ?
              `;

              const values = [
                designationData.name,
                designationData.description,
                designationData.department,
                designationData.level,
                designationData.status,
                req.params.id
              ];

              try {
                const [result] = await mysqlPool.execute(query, values);
                
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Designation not found' });
                  return;
                }
                res.json({ message: 'Designation updated successfully' });
              } catch (err) {
                console.error('Error updating designation:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });

            // Delete designation
            app.delete('/api/designations/:id', async (req, res) => {
              const query = 'DELETE FROM designations WHERE id = ?';
              try {
                const [result] = await mysqlPool.execute(query, [req.params.id]);
                
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Designation not found' });
                  return;
                }
                res.json({ message: 'Designation deleted successfully' });
              } catch (err) {
                console.error('Error deleting designation:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });
            // Import designations from Excel file
            app.post('/api/designations/import', upload.single('file'), async (req, res) => {
              if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
              }

              try {
                const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(worksheet);

                if (data.length === 0) {
                  return res.status(400).json({ error: 'No data found in file' });
                }

                let successCount = 0;
                let errorCount = 0;
                const errors = [];

                // Use MySQL connection pool for import
                for (let i = 0; i < data.length; i++) {
                  const row = data[i];
                  const designationData = {
                    name: row['Name'] || row['name'] || '',
                    description: row['Description'] || row['description'] || '',
                    department: row['Department'] || row['department'] || '',
                    level: row['Level'] || row['level'] || '',
                    status: row['Status'] || row['status'] || 'Active'
                  };

                  const query = `
                    INSERT INTO designations (name, description, department, level, status)
                    VALUES (?, ?, ?, ?, ?)
                  `;

                  const values = [
                    designationData.name,
                    designationData.description,
                    designationData.department,
                    designationData.level,
                    designationData.status
                  ];

                  try {
                    await mysqlPool.execute(query, values);
                      successCount++;
                  } catch (err) {
                    errorCount++;
                    errors.push(`Row ${i + 1}: ${err.message}`);
                    }
                }

                res.json({
                  message: `Import completed. ${successCount} designations imported successfully. ${errorCount} errors.`,
                  successCount,
                  errorCount,
                  errors: errors.length > 0 ? errors : undefined
                });

              } catch (error) {
                console.error('Error processing file:', error);
                res.status(500).json({ error: 'Error processing file' });
              }
            });

            // ===== LABELS API ENDPOINTS =====

            // Get all labels
            app.get('/api/labels', async (req, res) => {
              const query = 'SELECT * FROM labels ORDER BY created_at DESC';
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                const [results] = await connection.execute(query);
                res.json(results);
              } catch (err) {
                  console.error('Error fetching labels:', err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Get label by ID
            app.get('/api/labels/:id', async (req, res) => {
              const query = 'SELECT * FROM labels WHERE id = ?';
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                const [results] = await connection.execute(query, [req.params.id]);
                if (results.length === 0) {
                  res.status(404).json({ error: 'Label not found' });
                  return;
                }
                res.json(results[0]);
              } catch (err) {
                  console.error('Error fetching label:', err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Create new label
            app.post('/api/labels', async (req, res) => {
              const labelData = req.body;

              const query = `
                INSERT INTO labels (name, description, color, category, status)
                VALUES (?, ?, ?, ?, ?)
              `;

              const values = [
                labelData.name,
                labelData.description,
                labelData.color || '#3B82F6',
                labelData.category,
                labelData.status || 'Active'
              ];

              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                const [result] = await connection.execute(query, values);
                res.status(201).json({
                  id: result.insertId,
                  message: 'Label created successfully'
                });
              } catch (err) {
                  console.error('Error creating label:', err);
                if (err.code === 'ER_DUP_ENTRY') {
                  res.status(400).json({ error: 'Label with this name already exists' });
                } else if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
            // Update label
            app.put('/api/labels/:id', async (req, res) => {
              const labelData = req.body;

              const query = `
                UPDATE labels SET
                  name = ?, description = ?, color = ?, category = ?, status = ?
                WHERE id = ?
              `;

              const values = [
                labelData.name,
                labelData.description,
                labelData.color,
                labelData.category,
                labelData.status,
                req.params.id
              ];

              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                const [result] = await connection.execute(query, values);
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Label not found' });
                  return;
                }
                res.json({ message: 'Label updated successfully' });
              } catch (err) {
                console.error('Error updating label:', err);
                if (err.code === 'ER_DUP_ENTRY') {
                  res.status(400).json({ error: 'Label with this name already exists' });
                } else if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Delete label
            app.delete('/api/labels/:id', async (req, res) => {
              const query = 'DELETE FROM labels WHERE id = ?';
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                const [result] = await connection.execute(query, [req.params.id]);
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Label not found' });
                  return;
                }
                res.json({ message: 'Label deleted successfully' });
              } catch (err) {
                console.error('Error deleting label:', err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
            // Import labels from Excel file
            app.post('/api/labels/import', upload.single('file'), async (req, res) => {
              if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
              }

              try {
                const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(worksheet);

                if (data.length === 0) {
                  return res.status(400).json({ error: 'No data found in file' });
                }

                let successCount = 0;
                let errorCount = 0;
                const errors = [];
                let connection;

                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();

                  // Process rows sequentially to avoid connection issues
                  for (let i = 0; i < data.length; i++) {
                    const row = data[i];
                  const labelData = {
                    name: row['Name'] || row['name'] || '',
                    description: row['Description'] || row['description'] || '',
                    color: row['Color'] || row['color'] || '#3B82F6',
                    category: row['Category'] || row['category'] || '',
                    status: row['Status'] || row['status'] || 'Active'
                  };

                    // Skip rows without name
                    if (!labelData.name) {
                      errorCount++;
                      errors.push(`Row ${i + 1}: Name is required`);
                      continue;
                    }

                  const query = `
                    INSERT INTO labels (name, description, color, category, status)
                    VALUES (?, ?, ?, ?, ?)
                  `;

                  const values = [
                    labelData.name,
                    labelData.description,
                    labelData.color,
                    labelData.category,
                    labelData.status
                  ];

                    try {
                      await connection.execute(query, values);
                      successCount++;
                      console.log(`Row ${i + 1}: Successfully imported label "${labelData.name}"`);
                    } catch (err) {
                      errorCount++;
                      if (err.code === 'ER_DUP_ENTRY') {
                        errors.push(`Row ${i + 1}: Label "${labelData.name}" already exists`);
                    } else {
                        errors.push(`Row ${i + 1}: ${err.message}`);
                    }
                      console.error(`Row ${i + 1} import error:`, err.message);
                    }
                  }

                res.json({
                  message: `Import completed. ${successCount} labels imported successfully. ${errorCount} errors.`,
                  successCount,
                  errorCount,
                  errors: errors.length > 0 ? errors : undefined
                });

                } catch (error) {
                  console.error('Database connection error during import:', error);
                  res.status(500).json({ error: 'Database connection error during import' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }

              } catch (error) {
                console.error('Error processing file:', error);
                res.status(500).json({ error: 'Error processing file' });
              }
            });
            // Task Configuration API Routes
            // Get task configuration (scoring weights and points)
            app.get('/api/task-config', async (req, res) => {
              console.log('🔥 GET /api/task-config called!');
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                const query = 'SELECT config_type, config_data FROM task_configuration ORDER BY config_type';
                const [rows] = await connection.execute(query);
                console.log('📊 Database rows:', rows);
                
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
                
                console.log('📊 Final config being returned:', config);
                res.json(config);
              } catch (err) {
                console.error('Error fetching task configuration:', err);
                res.status(500).json({ error: 'Database error: ' + err.message });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
            // Update task configuration
            app.post('/api/task-config', async (req, res) => {
              console.log('🔥 POST /api/task-config called!');
              console.log('📥 Request body:', req.body);
              const { scoringWeights, scoringPoints } = req.body;
              let connection;
              
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                // Update or insert scoring weights
                if (scoringWeights) {
                  const weightsJson = JSON.stringify(scoringWeights);
                  await connection.execute(`
                    INSERT INTO task_configuration (config_type, config_data) 
                    VALUES ('scoring_weights', ?) 
                    ON DUPLICATE KEY UPDATE config_data = VALUES(config_data)
                  `, [weightsJson]);
                }
                
                // Update or insert scoring points
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
                if (connection) {
                  connection.release();
                }
              }
            });
            // Task API Routes
            // Get all tasks (optimized)
            app.get('/api/tasks', async (req, res) => {
  const { user_id, role, employee_name, department, employee, page = 1, limit = 50, all, search, status, priority, complexity, impact, effortEstimateLabel, unit, target, labels, assignedTo } = req.query;
  
  // Check if all tasks are requested (for timer management)
  const getAll = all === 'true';
  
  // Get user permissions from headers FIRST
  const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
  const userRole = req.headers['user-role'] || role || 'employee';
  const userName = req.headers['user-name'] || employee_name || '';
  
  // For admin users or when all=true, don't use pagination at all
  const isAdmin = (userRole === 'admin' || userRole === 'Admin');
  const skipPagination = getAll || isAdmin;
  
  // Pagination parameters - only use if not admin and not requesting all
  const pageNum = parseInt(page);
  const limitNum = skipPagination ? null : Math.min(parseInt(limit), 100); // No limit for admin/all
  const offset = skipPagination ? null : (pageNum - 1) * limitNum;
  
  // Debug logging
  console.log('🔍 Backend Debug - Tasks API Request:', {
    headers: req.headers,
    userPermissions: userPermissions,
    userRole: userRole,
    userName: userName,
    queryParams: req.query,
    pagination: { page: pageNum, limit: limitNum, offset },
    searchParams: { search, status, priority, complexity, impact, effortEstimateLabel, unit, target, labels, assignedTo }
  });
              
  // Optimized query with better indexing strategy - include all necessary fields
  let query = 'SELECT id, title, status, priority, department, assigned_to, created_at, updated_at, due_date, timer_started_at, logged_seconds, labels, complexity, impact, effort_estimate_label, unit, target, time_estimate_hours, time_estimate_minutes FROM tasks WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE 1=1';
  const params = [];
  const countParams = [];
              
  // Check permissions to determine what tasks user can see
  const hasViewOwnTasks = userPermissions.includes('view_own_tasks');
  const hasViewAllTasks = userPermissions.includes('view_tasks') || userPermissions.includes('all');
  const hasViewTasksContent = userPermissions.includes('view_tasks_content');
  const hasDwmView = userPermissions.includes('dwm_view');
              
  // Check if user is admin or has view_all_tasks permission
  const isAdminUser = userRole === 'admin';
  const hasViewAllTasksPermission = userPermissions.includes('view_tasks') || userPermissions.includes('all');
  
  // If user only has view_own_tasks permission, filter by assigned_to
  if (hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser && userName) {
    // If user also has dwm_view permission, include incomplete DWM tasks assigned to them
    if (hasDwmView) {
      // Include own tasks OR incomplete DWM tasks assigned to the user (daily/weekly/monthly)
      query += ' AND (assigned_to LIKE ? OR (assigned_to LIKE ? AND status != \'Completed\' AND (LOWER(IFNULL(labels,\'\')) LIKE \'%daily%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%weekly%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%monthly%\')))';
      countQuery += ' AND (assigned_to LIKE ? OR (assigned_to LIKE ? AND status != \'Completed\' AND (LOWER(IFNULL(labels,\'\')) LIKE \'%daily%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%weekly%\' OR LOWER(IFNULL(labels,\'\')) LIKE \'%monthly%\')))';
      params.push(`%${userName}%`, `%${userName}%`);
      countParams.push(`%${userName}%`, `%${userName}%`);
      console.log(`🔒 Filtering tasks for user ${userName} - showing own tasks + own incomplete DWM tasks`);
    } else {
      query += ' AND assigned_to LIKE ?';
      countQuery += ' AND assigned_to LIKE ?';
      params.push(`%${userName}%`);
      countParams.push(`%${userName}%`);
      console.log(`🔒 Filtering tasks for user ${userName} - only showing own tasks`);
    }
  } else if (hasViewAllTasksPermission || isAdminUser) {
    console.log(`🔓 User has view all tasks permission or is admin - showing all tasks`);
  } else if (hasViewTasksContent && !hasViewOwnTasks && !hasViewAllTasksPermission && !isAdminUser) {
    // User has view_tasks_content but no other task permissions - this shouldn't happen
    // but if it does, show no tasks for security
    console.log(`⚠️  User has only view_tasks_content permission without view_own_tasks - showing no tasks for security`);
    query += ' AND 1=0'; // Show no tasks
    countQuery += ' AND 1=0';
  } else {
    console.log(`⚠️  User has no task viewing permissions - showing no tasks`);
    query += ' AND 1=0'; // Show no tasks
    countQuery += ' AND 1=0';
  }
  // Add search functionality
  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)';
    countQuery += ' AND (title LIKE ? OR description LIKE ? OR assigned_to LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
    countParams.push(searchTerm, searchTerm, searchTerm);
  }

  // Add filter functionality
  if (department) {
    query += ' AND department = ?';
    countQuery += ' AND department = ?';
    params.push(department);
    countParams.push(department);
  }
  if (employee) {
    query += ' AND assigned_to LIKE ?';
    countQuery += ' AND assigned_to LIKE ?';
    params.push(`%${employee}%`);
    countParams.push(`%${employee}%`);
  }
  if (status) {
    query += ' AND status = ?';
    countQuery += ' AND status = ?';
    params.push(status);
    countParams.push(status);
  }
  if (priority) {
    query += ' AND priority = ?';
    countQuery += ' AND priority = ?';
    params.push(priority);
    countParams.push(priority);
  }
  if (complexity) {
    query += ' AND complexity = ?';
    countQuery += ' AND complexity = ?';
    params.push(complexity);
    countParams.push(complexity);
  }
  if (impact) {
    query += ' AND impact = ?';
    countQuery += ' AND impact = ?';
    params.push(impact);
    countParams.push(impact);
  }
  if (effortEstimateLabel) {
    query += ' AND effort_estimate_label = ?';
    countQuery += ' AND effort_estimate_label = ?';
    params.push(effortEstimateLabel);
    countParams.push(effortEstimateLabel);
  }
  if (unit) {
    query += ' AND unit = ?';
    countQuery += ' AND unit = ?';
    params.push(unit);
    countParams.push(unit);
  }
  if (target) {
    query += ' AND target = ?';
    countQuery += ' AND target = ?';
    params.push(target);
    countParams.push(target);
  }
  if (labels) {
    // Support multiple labels passed as a comma-separated list by matching ANY of them
    const labelParts = String(labels)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (labelParts.length === 1) {
      query += ' AND labels LIKE ?';
      countQuery += ' AND labels LIKE ?';
      params.push(`%${labelParts[0]}%`);
      countParams.push(`%${labelParts[0]}%`);
    } else if (labelParts.length > 1) {
      const likeConditions = labelParts.map(() => 'labels LIKE ?').join(' OR ');
      query += ` AND (${likeConditions})`;
      countQuery += ` AND (${likeConditions})`;
      for (const part of labelParts) {
        params.push(`%${part}%`);
        countParams.push(`%${part}%`);
      }
    }
  }
  if (assignedTo) {
    query += ' AND assigned_to LIKE ?';
    countQuery += ' AND assigned_to LIKE ?';
    params.push(`%${assignedTo}%`);
    countParams.push(`%${assignedTo}%`);
  }
              
  // Use indexed column for ordering
  query += ' ORDER BY created_at DESC';
  
  // Only add LIMIT and OFFSET if pagination is not skipped
  // NOTE: LIMIT and OFFSET cannot use placeholders in MySQL prepared statements
  if (!skipPagination) {
    // Ensure limitNum and offset are integers and sanitize them
    const safeLimit = parseInt(limitNum, 10);
    const safeOffset = parseInt(offset, 10);
    // Insert values directly into query (safe because we've validated them as integers)
    query += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    // Don't push limitNum and offset to params array
  }
  // Debug logging - show final query and params
  console.log('🔍 Backend Debug - Final Query:', query);
  console.log('🔍 Backend Debug - Query Params:', params);
  console.log('🔍 Backend Debug - Count Query:', countQuery);
  console.log('🔍 Backend Debug - Count Params:', countParams);
              
              try {
                // Execute both queries in parallel for better performance
                const [results, countResult] = await Promise.all([
                  mysqlPool.execute(query, params),
                  mysqlPool.execute(countQuery, countParams)
                ]);
                
                const total = countResult[0][0].total;
                
                if (skipPagination) {
                  // Return all tasks without pagination (for admin users or when all=true)
                  console.log(`🔍 Backend Debug - Query returned ${results[0].length} tasks (pagination skipped)`);
                  res.json({
                    data: results[0],
                    pagination: {
                      page: 1,
                      limit: total,
                      total,
                      totalPages: 1,
                      hasNext: false,
                      hasPrev: false
                    }
                  });
                } else {
                  // Normal pagination
                  const totalPages = Math.ceil(total / limitNum);
                  console.log(`🔍 Backend Debug - Query returned ${results[0].length} tasks out of ${total} total`);
                  res.json({
                    data: results[0],
                    pagination: {
                      page: pageNum,
                      limit: limitNum,
                      total,
                      totalPages,
                      hasNext: pageNum < totalPages,
                      hasPrev: pageNum > 1
                    }
                  });
                }
              } catch (err) {
                  console.error('Error fetching tasks:', err);
                  res.status(500).json({ error: 'Database error' });
                }
            });
            // Export tasks to CSV/Excel (must be before /api/tasks/:id route)
            app.get('/api/tasks/export', async (req, res) => {
              const { format = 'csv' } = req.query;
              console.log('=== TASK EXPORT REQUEST RECEIVED ===');
              console.log('Format:', format);
              
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                console.log('Database connection established');
                
                // Get all tasks with basic data first
                const query = `
                  SELECT 
                    id,
                    title,
                    description,
                    status,
                    priority,
                    complexity,
                    impact,
                    unit,
                    target,
                    effort_estimate_label,
                    time_estimate_hours,
                    time_estimate_minutes,
                    created_at,
                    updated_at,
                    due_date,
                    start_date,
                    assigned_to,
                    department,
                    labels,
                    checklist,
                    workflow_guide,
                    timer_started_at,
                    logged_seconds,
                    score
                  FROM tasks
                  ORDER BY created_at DESC
                `;
                
                const [tasks] = await connection.execute(query);
                console.log(`Found ${tasks.length} tasks to export`);
                
                if (tasks.length === 0) {
                  return res.status(404).json({ error: 'No tasks found to export' });
                }
                
                if (format === 'excel') {
                  // Create Excel file
                  const workbook = xlsx.utils.book_new();
                  const worksheet = xlsx.utils.json_to_sheet(tasks.map(task => ({
                    'Task ID': task.id,
                    'Title': task.title,
                    'Description': task.description,
                    'Status': task.status,
                    'Priority': task.priority,
                    'Complexity': task.complexity,
                    'Impact': task.impact,
                    'Unit': task.unit,
                    'Target': task.target,
                    'Effort Estimate': task.effort_estimate_label,
                    'Time Estimate (Hours)': task.time_estimate_hours,
                    'Time Estimate (Minutes)': task.time_estimate_minutes,
                    'Created At': task.created_at,
                    'Updated At': task.updated_at,
                    'Due Date': task.due_date,
                    'Start Date': task.start_date,
                    'Assigned To': task.assigned_to,
                    'Department': task.department,
                    'Labels': task.labels,
                    'Checklist': task.checklist,
                    'Workflow Guide': task.workflow_guide,
                    'Timer Started At': task.timer_started_at,
                    'Logged Seconds': task.logged_seconds,
                    'Score': task.score
                  })));
                  
                  xlsx.utils.book_append_sheet(workbook, worksheet, 'Tasks');
                  
                  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                  
                  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                  res.setHeader('Content-Disposition', `attachment; filename=tasks-export-${new Date().toISOString().split('T')[0]}.xlsx`);
                  res.send(buffer);
                } else {
                  // Create CSV file
                  const csvHeaders = [
                    'Task ID', 'Title', 'Description', 'Status', 'Priority', 'Complexity', 'Impact',
                    'Unit', 'Target', 'Effort Estimate', 'Time Estimate (Hours)', 'Time Estimate (Minutes)',
                    'Created At', 'Updated At', 'Due Date', 'Start Date', 'Assigned To', 'Department',
                    'Labels', 'Checklist', 'Workflow Guide', 'Timer Started At', 'Logged Seconds', 'Score'
                  ];
                  
                  const csvRows = tasks.map(task => [
                    task.id,
                    `"${(task.title || '').replace(/"/g, '""')}"`,
                    `"${(task.description || '').replace(/"/g, '""')}"`,
                    task.status || '',
                    task.priority || '',
                    task.complexity || '',
                    task.impact || '',
                    task.unit || '',
                    task.target || '',
                    task.effort_estimate_label || '',
                    task.time_estimate_hours || '',
                    task.time_estimate_minutes || '',
                    task.created_at || '',
                    task.updated_at || '',
                    task.due_date || '',
                    task.start_date || '',
                    `"${(task.assigned_to || '').replace(/"/g, '""')}"`,
                    task.department || '',
                    `"${(task.labels || '').replace(/"/g, '""')}"`,
                    `"${(task.checklist || '').replace(/"/g, '""')}"`,
                    `"${(task.workflow_guide || '').replace(/"/g, '""')}"`,
                    task.timer_started_at || '',
                    task.logged_seconds || '',
                    task.score || ''
                  ]);
                  
                  const csvContent = [csvHeaders, ...csvRows].map(row => row.join(',')).join('\n');
                  
                  res.setHeader('Content-Type', 'text/csv');
                  res.setHeader('Content-Disposition', `attachment; filename=tasks-export-${new Date().toISOString().split('T')[0]}.csv`);
                  res.send(csvContent);
                }
                
              } catch (error) {
                console.error('Error exporting tasks:', error);
                console.error('Error details:', error.message, error.stack);
                if (!res.headersSent) {
                  res.status(500).json({ error: `Error exporting tasks: ${error.message}` });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Get task by ID
            app.get('/api/tasks/:id', async (req, res) => {
              const query = 'SELECT * FROM tasks WHERE id = ?';
              try {
                const [results] = await mysqlPool.execute(query, [req.params.id]);
                
                if (results.length === 0) {
                  res.status(404).json({ error: 'Task not found' });
                  return;
                }
                res.json(results[0]);
              } catch (err) {
                console.error('Error fetching task:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });
            // Create new task
            app.post('/api/tasks', async (req, res) => {
              // Get user permissions from headers
              const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
              const userRole = req.headers['user-role'] || 'employee';
              
              // Check if user has create_tasks permission or is admin
              if (!userPermissions.includes('create_tasks') && !userPermissions.includes('all') && userRole !== 'admin') {
                console.log(`Access denied: User role ${userRole} attempted to create task without permission`);
                return res.status(403).json({ 
                  error: 'Access denied. You do not have permission to create tasks.',
                  requiredPermission: 'create_tasks'
                });
              }
              
              const taskData = req.body;
              const query = `
                INSERT INTO tasks (
                  title, department, task_category, project, start_date, due_date, without_due_date,
                  assigned_to, status, description, responsible, accountable, consulted, informed, trained,
                  labels, milestones, priority, complexity, impact, unit, target, effort_estimate_label, time_estimate_hours, time_estimate_minutes, make_private, share, \`repeat\`, \`is_dependent\`,
                  validation_by, effort_label, checklist, workflow_guide
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `;
              const values = [
                taskData.title || null, 
                taskData.department || null, 
                taskData.taskCategory || null, 
                taskData.project || null,
                taskData.startDate || null, 
                taskData.dueDate || null, 
                taskData.withoutDueDate ? 1 : 0,
                toAssignedToString(taskData) || null, 
                taskData.status || 'Pending', 
                taskData.description || null,
                taskData.responsible || null, 
                taskData.accountable || null, 
                taskData.consulted || null, 
                taskData.informed || null, 
                taskData.trained || null,
                taskData.labels || null, 
                taskData.milestones || null, 
                taskData.priority || 'Medium',
                taskData.complexity || null, 
                taskData.impact || null, 
                taskData.unit || null, 
                taskData.target || null, 
                taskData.effort_estimate_label || null,
                taskData.time_estimate_hours || 0,
                taskData.time_estimate_minutes || 0,
                taskData.makePrivate ? 1 : 0, 
                taskData.share ? 1 : 0, 
                taskData.repeat ? 1 : 0, 
                taskData.isDependent ? 1 : 0,
                taskData.validationBy || null, 
                taskData.effortLabel || null, 
                taskData.checklist || null, 
                taskData.workflowGuide || null
              ];
              
              try {
                // Debug logging to see what values are being sent
                console.log('Task creation - Received data:', JSON.stringify(taskData, null, 2));
                console.log('Task creation - Values array:', JSON.stringify(values, null, 2));
                
                const [result] = await mysqlPool.execute(query, values);
                
                const newTaskId = result.insertId;
                
                // Log task creation history
                await logTaskHistory(
                  newTaskId,
                  'Created',
                  'Task created',
                  'Admin',
                  1
                );
                
                res.status(201).json({ message: 'Task created successfully', id: newTaskId });
              } catch (err) {
                console.error('Error creating task:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });

            // Update task
            app.put('/api/tasks/:id', async (req, res) => {
              const taskId = req.params.id;
              const taskData = req.body;
              
              // Debug logging for unit value updates
              if (taskData.unit !== undefined) {
                console.log(`=== UNIT VALUE UPDATE DEBUG ===`);
                console.log(`Task ID: ${taskId}`);
                console.log(`Received unit value: ${taskData.unit}`);
                console.log(`Unit value type: ${typeof taskData.unit}`);
                console.log(`Full request body:`, JSON.stringify(req.body, null, 2));
              }

              // Build dynamic UPDATE query - only update fields that are provided
              const updateFields = [];
              const values = [];
              
              // Check each field and only include it in the update if it's provided
              if (taskData.title !== undefined) {
                updateFields.push('title = ?');
                values.push(taskData.title || null);
              }
              if (taskData.department !== undefined) {
                updateFields.push('department = ?');
                values.push(taskData.department || null);
              }
              if (taskData.taskCategory !== undefined) {
                updateFields.push('task_category = ?');
                values.push(taskData.taskCategory || null);
              }
              if (taskData.project !== undefined) {
                updateFields.push('project = ?');
                values.push(taskData.project || null);
              }
              if (taskData.startDate !== undefined) {
                updateFields.push('start_date = ?');
                values.push(taskData.startDate || null);
              }
              if (taskData.dueDate !== undefined) {
                updateFields.push('due_date = ?');
                values.push(taskData.dueDate || null);
              }
              if (taskData.withoutDueDate !== undefined) {
                updateFields.push('without_due_date = ?');
                values.push(taskData.withoutDueDate ? 1 : 0);
              }
              if (taskData.assigned_to !== undefined || taskData.assignedTo !== undefined) {
                updateFields.push('assigned_to = ?');
                values.push(toAssignedToString(taskData) || null);
              }
              if (taskData.status !== undefined) {
                updateFields.push('status = ?');
                values.push(taskData.status || null);
              }
              if (taskData.description !== undefined) {
                updateFields.push('description = ?');
                values.push(taskData.description || null);
              }
              if (taskData.responsible !== undefined) {
                updateFields.push('responsible = ?');
                values.push(taskData.responsible || null);
              }
              if (taskData.accountable !== undefined) {
                updateFields.push('accountable = ?');
                values.push(taskData.accountable || null);
              }
              if (taskData.consulted !== undefined) {
                updateFields.push('consulted = ?');
                values.push(taskData.consulted || null);
              }
              if (taskData.informed !== undefined) {
                updateFields.push('informed = ?');
                values.push(taskData.informed || null);
              }
              if (taskData.trained !== undefined) {
                updateFields.push('trained = ?');
                values.push(taskData.trained || null);
              }
              if (taskData.labels !== undefined) {
                updateFields.push('labels = ?');
                values.push(taskData.labels || null);
              }
              if (taskData.milestones !== undefined) {
                updateFields.push('milestones = ?');
                values.push(taskData.milestones || null);
              }
              if (taskData.priority !== undefined) {
                updateFields.push('priority = ?');
                values.push(taskData.priority || null);
              }
              if (taskData.complexity !== undefined) {
                updateFields.push('complexity = ?');
                values.push(taskData.complexity || null);
              }
              if (taskData.impact !== undefined) {
                updateFields.push('impact = ?');
                values.push(taskData.impact || null);
              }
              if (taskData.unit !== undefined) {
                updateFields.push('unit = ?');
                values.push(taskData.unit || null);
              }
              if (taskData.target !== undefined) {
                updateFields.push('target = ?');
                values.push(taskData.target || null);
              }
              if (taskData.effort_estimate_label !== undefined) {
                updateFields.push('effort_estimate_label = ?');
                values.push(taskData.effort_estimate_label || null);
              }
              if (taskData.time_estimate_hours !== undefined) {
                updateFields.push('time_estimate_hours = ?');
                values.push(taskData.time_estimate_hours || 0);
              }
              if (taskData.time_estimate_minutes !== undefined) {
                updateFields.push('time_estimate_minutes = ?');
                values.push(taskData.time_estimate_minutes || 0);
              }
              if (taskData.makePrivate !== undefined) {
                updateFields.push('make_private = ?');
                values.push(taskData.makePrivate ? 1 : 0);
              }
              if (taskData.share !== undefined) {
                updateFields.push('share = ?');
                values.push(taskData.share ? 1 : 0);
              }
              if (taskData.repeat !== undefined) {
                updateFields.push('`repeat` = ?');
                values.push(taskData.repeat ? 1 : 0);
              }
              if (taskData.isDependent !== undefined) {
                updateFields.push('`is_dependent` = ?');
                values.push(taskData.isDependent ? 1 : 0);
              }
              if (taskData.validationBy !== undefined) {
                updateFields.push('validation_by = ?');
                values.push(taskData.validationBy || null);
              }
              if (taskData.effortLabel !== undefined) {
                updateFields.push('effort_label = ?');
                values.push(taskData.effortLabel || null);
              }
              if (taskData.checklist !== undefined) {
                updateFields.push('checklist = ?');
                values.push(taskData.checklist || null);
              }
              if (taskData.workflowGuide !== undefined) {
                updateFields.push('workflow_guide = ?');
                values.push(taskData.workflowGuide || null);
              }

              // Always update the updated_at timestamp
              updateFields.push('updated_at = CURRENT_TIMESTAMP');

              // Add taskId to values
              values.push(taskId);

              // Validate that at least one field is being updated (other than updated_at)
              if (updateFields.length < 2) { // Only updated_at timestamp
                res.status(400).json({ error: 'No fields to update' });
                return;
              }

              const query = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
              
              // Debug logging for unit updates
              if (taskData.unit !== undefined) {
                console.log(`=== UNIT UPDATE QUERY DEBUG ===`);
                console.log(`Query: ${query}`);
                console.log(`Values:`, values);
                console.log(`Update fields:`, updateFields);
              }
              
              try {
                const [result] = await mysqlPool.execute(query, values);
                
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Task not found' });
                  return;
                }
                res.json({ message: 'Task updated successfully' });
              } catch (err) {
                console.error('Error updating task:', err);
                res.status(500).json({ error: 'Database error' });
              }
            });



            // Clear all timer data (for testing)
            app.post('/api/tasks/clear-timers', async (req, res) => {
              const query = `
                UPDATE tasks SET 
                  timer_started_at = NULL,
                  logged_seconds = 0,
                  updated_at = CURRENT_TIMESTAMP
              `;
              try {
                const [result] = await mysqlPool.execute(query);
                res.json({ message: 'All timers cleared successfully' });
              } catch (err) {
                  console.error('Error clearing timers:', err);
                  res.status(500).json({ error: 'Database error' });
                }
            });

            // Delete specific task history entry (admin only) - using POST for better compatibility
            app.post('/api/task-history/:id/delete', async (req, res) => {
              console.log('POST /api/task-history/:id/delete called');
              console.log('Params:', req.params);
              console.log('Body:', req.body);
              console.log('Headers:', req.headers);
              
              const historyId = req.params.id;
              const { user_role } = req.body;
              
              console.log('History ID:', historyId);
              console.log('User Role:', user_role);
              
              // Check if user is admin
              if (user_role !== 'admin') {
                console.log('Access denied: user_role is not admin');
                return res.status(403).json({ error: 'Only administrators can delete task history' });
              }
              
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                const query = 'DELETE FROM task_history WHERE id = ?';
                console.log('Executing query:', query, 'with params:', [historyId]);
                
                const [result] = await connection.execute(query, [historyId]);
                
                console.log('Delete operation completed. Affected rows:', result.affectedRows);
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Task history entry not found' });
                  return;
                }
                res.json({ message: 'Task history entry deleted successfully' });
              } catch (err) {
                console.error('Error deleting task history:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
            // Delete all history for a specific task (admin only)
            app.post('/api/task-history/task/:taskId/delete-all', async (req, res) => {
              console.log('POST /api/task-history/task/:taskId/delete-all called');
              console.log('Params:', req.params);
              console.log('Body:', req.body);
              console.log('Headers:', req.headers);
              
              const taskId = req.params.taskId;
              const { user_role } = req.body;
              
              console.log('Task ID:', taskId);
              console.log('User Role:', user_role);
              
              // Check if user is admin
              if (user_role !== 'admin') {
                console.log('Access denied: user_role is not admin');
                return res.status(403).json({ error: 'Only administrators can delete task history' });
              }
              
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                // First, get the count of history entries to be deleted
                const countQuery = 'SELECT COUNT(*) as count FROM task_history WHERE task_id = ?';
                const [countResult] = await connection.execute(countQuery, [taskId]);
                const historyCount = countResult[0].count;
                
                console.log('History entries to delete:', historyCount);
                
                if (historyCount === 0) {
                  return res.status(404).json({ error: 'No history entries found for this task' });
                }
                
                // Delete all history entries for the task
                const deleteQuery = 'DELETE FROM task_history WHERE task_id = ?';
                console.log('Executing query:', deleteQuery, 'with params:', [taskId]);
                
                const [deleteResult] = await connection.execute(deleteQuery, [taskId]);
                
                console.log('Delete all operation completed. Affected rows:', deleteResult.affectedRows);
                res.json({ 
                  message: `All history entries (${historyCount}) deleted successfully`,
                  deletedCount: historyCount
                });
              } catch (err) {
                console.error('Error deleting all task history:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
            // Start timer for task
            app.post('/api/tasks/:id/start-timer', async (req, res) => {
              const taskId = req.params.id;
              const { user_name, user_id } = req.body;
              
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
              
              // First, check if the user already has an active timer on any task
              const checkUserActiveTimerQuery = `
                SELECT id, title, timer_started_at 
                FROM tasks 
                WHERE assigned_to LIKE ? AND timer_started_at IS NOT NULL
              `;
              
                const [activeTasks] = await connection.execute(checkUserActiveTimerQuery, [`%${user_name}%`]);
                
                // If user already has an active timer, return error
                if (activeTasks.length > 0) {
                  const activeTask = activeTasks[0];
                  res.status(400).json({ 
                    error: 'You already have an active timer',
                    message: `You have an active timer on task: "${activeTask.title}". Please stop it before starting a new one.`,
                    activeTaskId: activeTask.id
                  });
                  return;
                }
                
                // Get the current task to check if timer is already running
                const getTaskQuery = 'SELECT timer_started_at, assigned_to FROM tasks WHERE id = ?';
                const [tasks] = await connection.execute(getTaskQuery, [taskId]);
                
                if (tasks.length === 0) {
                    res.status(404).json({ error: 'Task not found' });
                    return;
                  }
                
                const task = tasks[0];
                  
                  // Check if the user is assigned to this task
                  if (!task.assigned_to || !task.assigned_to.includes(user_name)) {
                    res.status(403).json({ 
                      error: 'Access denied',
                      message: 'You are not assigned to this task'
                    });
                    return;
                  }
                  
                  // If timer is already running on this task, don't restart it
                  if (task.timer_started_at) {
                    res.status(400).json({ 
                      error: 'Timer already running',
                      message: 'This task already has an active timer'
                    });
                    return;
                  }
                  
                  // Get current local Pakistan time in ISO format to avoid timezone issues
                  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T') + '.000Z';
                  
                  // Start the timer with current local timestamp
                  const startTimerQuery = `
                    UPDATE tasks SET 
                      timer_started_at = ?,
                      status = 'In Progress',
                      updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `;
                  
                const [result] = await connection.execute(startTimerQuery, [now, taskId]);
                
                if (result.affectedRows === 0) {
                      res.status(404).json({ error: 'Task not found' });
                      return;
                    }
                    
                    // Log timer start history
                await logTaskHistory(
                      taskId,
                      'Timer started',
                      'Timer started for task',
                      user_name || 'Admin',
                      user_id || 1
                    );
                    
                    res.json({ message: 'Timer started successfully' });
                
              } catch (err) {
                console.error('Error starting timer:', err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Update task status with history tracking
            app.put('/api/tasks/:id/status', async (req, res) => {
              const taskId = req.params.id;
              const { status, user_name, user_id, old_status } = req.body;
              
              if (!status) {
                return res.status(400).json({ error: 'Status is required' });
              }

              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                // Update task status
                const updateQuery = 'UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                const [result] = await connection.execute(updateQuery, [status, taskId]);
                
                if (result.affectedRows === 0) {
                  return res.status(404).json({ error: 'Task not found' });
                }

                // Log status change history
                if (old_status && old_status !== status) {
                  await logTaskHistory(
                    taskId,
                    'Status changed',
                    `Status changed from "${old_status}" to "${status}"`,
                    user_name || 'Admin',
                    user_id || 1,
                    old_status,
                    status
                  );
                }
                
                res.json({ message: 'Task status updated successfully' });
              } catch (err) {
                console.error('Error updating task status:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Get task history
            app.get('/api/tasks/:id/history', async (req, res) => {
              const taskId = req.params.id;
              
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                const query = `
                  SELECT 
                    id,
                    action,
                    description,
                    user_name,
                    old_value,
                    new_value,
                    created_at,
                    -- Subtract 1 hour to fix the timezone offset issue
                    DATE_FORMAT(DATE_SUB(created_at, INTERVAL 1 HOUR), '%Y-%m-%d %H:%i:%s') as formatted_date
                  FROM task_history 
                  WHERE task_id = ? 
                  ORDER BY created_at DESC
                `;
                
                const [rows] = await connection.execute(query, [taskId]);
                res.json(rows);
              } catch (err) {
                console.error('Error fetching task history:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
            // Delete multiple tasks (bulk delete) - MUST be before /api/tasks/:id route
            app.delete('/api/tasks/bulk', async (req, res) => {
              console.log('🔥 BULK DELETE ENDPOINT CALLED!');
              try {
                const { ids } = req.body;
                
                // Get user permissions from headers
                const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
                const userRole = req.headers['user-role'] || 'employee';
                const userName = req.headers['user-name'] || '';
                
                console.log('=== BULK DELETE SERVER DEBUG ===');
                console.log('Bulk delete request received:', req.body);
                console.log('User permissions:', userPermissions);
                console.log('User role:', userRole);
                console.log('User name:', userName);
                console.log('IDs to delete:', ids);
                
                if (!ids || !Array.isArray(ids) || ids.length === 0) {
                  console.log('Validation failed: IDs array is required');
                  return res.status(400).json({ error: 'IDs array is required' });
                }
                
                // Check permissions
                const hasDeleteOwnTasks = userPermissions.includes('delete_own_tasks');
                const hasDeleteAllTasks = userPermissions.includes('delete_tasks') || userPermissions.includes('all');
                
                if (!hasDeleteOwnTasks && !hasDeleteAllTasks) {
                  console.log('Access denied: User has no delete permissions');
                  return res.status(403).json({ error: 'Access denied: You do not have permission to delete tasks' });
                }
                
                // Check if tasks exist
                const placeholders = ids.map(() => '?').join(',');
                const checkQuery = `SELECT id, title, assigned_to FROM tasks WHERE id IN (${placeholders})`;
                console.log('Check query:', checkQuery);
                console.log('Check query params:', ids);
                
                const [existingTasks] = await mysqlPool.execute(checkQuery, ids);
                console.log('Existing tasks found:', existingTasks.length);
                
                if (existingTasks.length === 0) {
                  console.log('No tasks found with the provided IDs');
                  return res.status(404).json({ error: 'No tasks found with the provided IDs' });
                }
                
                // Filter tasks based on permissions
                let tasksToDelete = existingTasks;
                if (hasDeleteOwnTasks && !hasDeleteAllTasks && userName) {
                  tasksToDelete = existingTasks.filter(task => 
                    task.assigned_to && task.assigned_to.toLowerCase().includes(userName.toLowerCase())
                  );
                  
                  if (tasksToDelete.length === 0) {
                    return res.status(403).json({ error: 'Access denied: You can only delete tasks assigned to you' });
                  }
                }
                
                // Get all attachment file paths before deleting tasks
                const taskIdsToDelete = tasksToDelete.map(task => task.id);
                const attachmentPlaceholders = taskIdsToDelete.map(() => '?').join(',');
                const [attachments] = await mysqlPool.execute(
                  `SELECT file_path FROM task_attachments WHERE task_id IN (${attachmentPlaceholders})`,
                  taskIdsToDelete
                );
                
                // Delete tasks (this will cascade delete attachments due to foreign key)
                const deletePlaceholders = taskIdsToDelete.map(() => '?').join(',');
                const deleteQuery = `DELETE FROM tasks WHERE id IN (${deletePlaceholders})`;
                
                console.log('Delete query:', deleteQuery);
                console.log('Delete query params:', taskIdsToDelete);
                
                const [deleteResult] = await mysqlPool.execute(deleteQuery, taskIdsToDelete);
                
                // Delete physical files from disk
                for (const attachment of attachments) {
                  const filePath = path.join(__dirname, attachment.file_path);
                  if (fs.existsSync(filePath)) {
                    try {
                      fs.unlinkSync(filePath);
                      console.log(`Deleted file: ${filePath}`);
                    } catch (fileErr) {
                      console.error(`Error deleting file ${filePath}:`, fileErr);
                    }
                  }
                }
                
                console.log('Delete operation completed. Affected rows:', deleteResult.affectedRows);
                res.json({ 
                  message: `${deleteResult.affectedRows} task(s) and all associated files deleted successfully`,
                  deletedCount: deleteResult.affectedRows 
                });
              } catch (err) {
                console.error('Error in bulk delete:', err);
                res.status(500).json({ error: 'Database error: ' + err.message });
              }
            });

            // Delete task
            app.delete('/api/tasks/:id', async (req, res) => {
              const taskId = req.params.id;
              let connection;
              
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                // First, get all attachment file paths before deleting
                const [attachments] = await connection.execute(
                  'SELECT file_path FROM task_attachments WHERE task_id = ?',
                  [taskId]
                );
                
                // Delete the task (this will cascade delete attachments due to foreign key)
                const [result] = await connection.execute('DELETE FROM tasks WHERE id = ?', [taskId]);
                
                if (result.affectedRows === 0) {
                  res.status(404).json({ error: 'Task not found' });
                  return;
                }
                
                // Delete physical files from disk
                for (const attachment of attachments) {
                  const filePath = path.join(__dirname, attachment.file_path);
                  if (fs.existsSync(filePath)) {
                    try {
                      fs.unlinkSync(filePath);
                      console.log(`Deleted file: ${filePath}`);
                    } catch (fileErr) {
                      console.error(`Error deleting file ${filePath}:`, fileErr);
                    }
                  }
                }
                
                res.json({ message: 'Task and all associated files deleted successfully' });
              } catch (err) {
                console.error('Error deleting task:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Stop timer for task
            app.post('/api/tasks/:id/stop-timer', async (req, res) => {
              const taskId = req.params.id;
              const { loggedSeconds, user_name, user_id, memo } = req.body;
              
              let connection;
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
              // First get the task to get the timer start time
              const getTaskQuery = 'SELECT timer_started_at FROM tasks WHERE id = ?';
                const [tasks] = await connection.execute(getTaskQuery, [taskId]);
                
                if (tasks.length === 0 || !tasks[0].timer_started_at) {
                  res.status(400).json({ error: 'No active timer found' });
                  return;
                }
                
                const task = tasks[0];
                const startTime = new Date(task.timer_started_at);
                const endTime = new Date();
                
                // Calculate actual duration in seconds
                const actualDurationSeconds = Math.floor((endTime - startTime) / 1000);
                
                // Use the calculated duration instead of relying on frontend parameter
                const finalLoggedSeconds = actualDurationSeconds > 0 ? actualDurationSeconds : (loggedSeconds || 0);
                
                const updateQuery = `
                  UPDATE tasks SET 
                    timer_started_at = NULL,
                    logged_seconds = logged_seconds + ?,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `;
                
                const [updateResult] = await connection.execute(updateQuery, [finalLoggedSeconds, taskId]);
                
                if (updateResult.affectedRows === 0) {
                    res.status(404).json({ error: 'Task not found' });
                    return;
                  }
                  
                  // Save timesheet entry
                  const timesheetQuery = `
                    INSERT INTO task_timesheet (
                      task_id, employee_name, employee_id, start_time, end_time, memo, hours_logged, hours_logged_seconds
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  `;
                  
                try {
                  // Use local Pakistan time for timesheet entries
                  const localStartTime = new Date(startTime.toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T') + '.000Z');
                  const localEndTime = new Date(endTime.toLocaleString('sv-SE', { timeZone: 'Asia/Karachi' }).replace(' ', 'T') + '.000Z');
                  
                  await connection.execute(timesheetQuery, [
                    taskId,
                    user_name || 'Admin',
                    user_id || 1,
                    localStartTime.toISOString(),
                    localEndTime.toISOString(),
                    memo || '',
                    finalLoggedSeconds,
                    finalLoggedSeconds
                  ]);
                } catch (timesheetErr) {
                  console.error('Error saving timesheet entry:', timesheetErr);
                }
                  
                  // Log timer stop history with memo
                  const historyDescription = memo 
                    ? `Timer stopped. Logged ${Math.floor(finalLoggedSeconds / 3600)}h ${Math.floor((finalLoggedSeconds % 3600) / 60)}m. Memo: ${memo}`
                    : `Timer stopped. Logged ${Math.floor(finalLoggedSeconds / 3600)}h ${Math.floor((finalLoggedSeconds % 3600) / 60)}m`;
                  
                await logTaskHistory(
                    taskId,
                    'Timer stopped',
                    historyDescription,
                    user_name || 'Admin',
                    user_id || 1
                  );
                  
                  res.json({ message: 'Timer stopped successfully' });
                
              } catch (err) {
                console.error('Error stopping timer:', err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                  console.error('MySQL connection lost, attempting to reconnect...');
                  res.status(503).json({ error: 'Database connection lost, please try again' });
                } else {
                  res.status(500).json({ error: 'Database error' });
                }
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // File upload for task attachments
            app.post('/api/tasks/:id/upload', async (req, res) => {
              const taskId = req.params.id;
              const upload = multer({
                storage: multer.diskStorage({
                  destination: (req, file, cb) => {
                    const uploadDir = path.join(__dirname, 'uploads', 'task-attachments');
                    if (!fs.existsSync(uploadDir)) {
                      fs.mkdirSync(uploadDir, { recursive: true });
                    }
                    cb(null, uploadDir);
                  },
                  filename: (req, file, cb) => {
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                    cb(null, uniqueSuffix + '-' + file.originalname);
                  }
                }),
                limits: {
                  fileSize: 10 * 1024 * 1024 // 10MB limit
                },
                fileFilter: (req, file, cb) => {
                  // Allow common file types
                  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip|rar/;
                  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
                  const mimetype = allowedTypes.test(file.mimetype);
                  
                  if (mimetype && extname) {
                    return cb(null, true);
                  } else {
                    cb(new Error('Invalid file type'));
                  }
                }
              });
              
              upload.array('attachments', 10)(req, res, async (err) => {
                if (err) {
                  console.error('File upload error:', err);
                  return res.status(400).json({ error: err.message });
                }
                
                if (!req.files || req.files.length === 0) {
                  return res.status(400).json({ error: 'No files uploaded' });
                }
                
                let connection;
                try {
                  connection = await mysqlPool.getConnection();
                  await connection.ping();
                  
                  // Verify task exists
                  const [tasks] = await connection.execute('SELECT id FROM tasks WHERE id = ?', [taskId]);
                  if (tasks.length === 0) {
                    return res.status(404).json({ error: 'Task not found' });
                  }
                  
                  const uploadedFiles = [];
                  
                  for (const file of req.files) {
                    // Save file info to database
                    const insertQuery = `
                      INSERT INTO task_attachments (task_id, file_name, file_path, file_size, file_type, uploaded_by)
                      VALUES (?, ?, ?, ?, ?, ?)
                    `;
                    
                    const relativePath = path.relative(__dirname, file.path);
                    const uploadedBy = req.body.uploaded_by || 1; // Default to user ID 1 if not provided
                    
                    await connection.execute(insertQuery, [
                      taskId,
                      file.originalname,
                      relativePath,
                      file.size,
                      file.mimetype,
                      uploadedBy
                    ]);
                    
                    uploadedFiles.push({
                      id: Date.now() + Math.random(), // Temporary ID for frontend
                      name: file.originalname,
                      size: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
                      uploadedAt: new Date().toLocaleString(),
                      path: relativePath
                    });
                  }
                  
                  res.json({ 
                    message: 'Files uploaded successfully',
                    files: uploadedFiles 
                  });
                  
                } catch (dbErr) {
                  console.error('Database error:', dbErr);
                  res.status(500).json({ error: 'Database error' });
                } finally {
                  if (connection) {
                    connection.release();
                  }
                }
              });
            });
            // Get task attachments
            app.get('/api/tasks/:id/attachments', async (req, res) => {
              const taskId = req.params.id;
              let connection;
              
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                const query = `
                  SELECT id, file_name, file_path, file_size, file_type, uploaded_by, created_at
                  FROM task_attachments
                  WHERE task_id = ?
                  ORDER BY created_at DESC
                `;
                
                const [attachments] = await connection.execute(query, [taskId]);
                
                const formattedAttachments = attachments.map(attachment => ({
                  id: attachment.id,
                  name: attachment.file_name,
                  size: `${(attachment.file_size / 1024 / 1024).toFixed(1)}MB`,
                  uploadedAt: new Date(attachment.created_at).toLocaleString(),
                  path: attachment.file_path,
                  type: attachment.file_type
                }));
                
                res.json({ attachments: formattedAttachments });
                
              } catch (err) {
                console.error('Error fetching task attachments:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });

            // Delete task attachment
            app.delete('/api/tasks/:id/attachments/:attachmentId', async (req, res) => {
              const { id: taskId, attachmentId } = req.params;
              let connection;
              
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                // Get attachment info first
                const [attachments] = await connection.execute(
                  'SELECT file_path FROM task_attachments WHERE id = ? AND task_id = ?',
                  [attachmentId, taskId]
                );
                
                if (attachments.length === 0) {
                  return res.status(404).json({ error: 'Attachment not found' });
                }
                
                // Delete from database
                await connection.execute(
                  'DELETE FROM task_attachments WHERE id = ? AND task_id = ?',
                  [attachmentId, taskId]
                );
                
                // Delete physical file
                const filePath = path.join(__dirname, attachments[0].file_path);
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
                
                res.json({ message: 'Attachment deleted successfully' });
                
              } catch (err) {
                console.error('Error deleting task attachment:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
            // Download task attachment
            app.get('/api/tasks/:id/attachments/:attachmentId/download', async (req, res) => {
              const { id: taskId, attachmentId } = req.params;
              let connection;
              
              try {
                connection = await mysqlPool.getConnection();
                await connection.ping();
                
                const [attachments] = await connection.execute(
                  'SELECT file_name, file_path FROM task_attachments WHERE id = ? AND task_id = ?',
                  [attachmentId, taskId]
                );
                
                if (attachments.length === 0) {
                  return res.status(404).json({ error: 'Attachment not found' });
                }
                
                const attachment = attachments[0];
                const filePath = path.join(__dirname, attachment.file_path);
                
                if (!fs.existsSync(filePath)) {
                  return res.status(404).json({ error: 'File not found on disk' });
                }
                
                res.download(filePath, attachment.file_name);
                
              } catch (err) {
                console.error('Error downloading task attachment:', err);
                res.status(500).json({ error: 'Database error' });
              } finally {
                if (connection) {
                  connection.release();
                }
              }
            });
// Import tasks from Excel file
app.post('/api/tasks/import', upload.single('file'), async (req, res) => {
  console.log('=== TASK IMPORT REQUEST RECEIVED ===');
  console.log('Request headers:', req.headers);
  console.log('Request body keys:', Object.keys(req.body || {}));
  console.log('File received:', req.file ? 'YES' : 'NO');
  
  if (!req.file) {
    console.log('No file uploaded - returning 400 error');
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  console.log('File details:', {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  });

  try {
    console.log('Processing file:', req.file.originalname);
    
    let data;
    const fileExtension = req.file.originalname.toLowerCase().split('.').pop();
    
    if (fileExtension === 'csv') {
      // Handle CSV files differently
      const csvContent = req.file.buffer.toString('utf8');
      const lines = csvContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length === 0) {
        return res.status(400).json({ error: 'No data found in CSV file' });
      }
      
      // Parse CSV manually to handle column count issues
      const parseCSVLine = (line) => {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim().replace(/^"(.*)"$/, '$1')); // Remove surrounding quotes
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim().replace(/^"(.*)"$/, '$1')); // Add the last value and remove quotes
        return values;
      };
      const headers = parseCSVLine(lines[0]);
      const dataRows = lines.slice(1);
      console.log('CSV Headers:', headers);
      console.log('CSV Headers count:', headers.length);
      console.log('Total data rows:', dataRows.length);
      
      data = dataRows.map((line, rowIndex) => {
        const values = parseCSVLine(line);
        
        // Pad with empty strings if row has fewer values than headers
        while (values.length < headers.length) {
          values.push('');
        }
        
        // Truncate if row has more values than headers
        if (values.length > headers.length) {
          values.splice(headers.length);
        }
        
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = values[index] || '';
        });
        
        if (rowIndex < 3) { // Log first 3 rows for debugging
          console.log(`Row ${rowIndex + 1} values:`, values);
          console.log(`Row ${rowIndex + 1} values count:`, values.length);
          console.log(`Row ${rowIndex + 1} object:`, obj);
        }
        
        return obj;
      });
    } else {
      // Handle Excel files
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(worksheet, { 
        defval: '' // Default value for empty cells
      });
    }

    console.log('Data rows found:', data.length);
    console.log('First row sample:', data[0]);
    console.log('First row keys:', Object.keys(data[0] || {}));
    console.log('First row values:', Object.values(data[0] || {}));

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    let processedCount = 0;

    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      console.log(`Processing row ${i + 1}:`, row);
      
      // Check if row has any data
      if (!row || Object.keys(row).length === 0) {
        console.log(`Skipping empty row ${i + 1}`);
        continue;
      }
      
      const taskData = {
        title: row['title'] || row['Title'] || '',
        department: row['department'] || row['Departme'] || row['Department'] || '',
        taskCategory: row['category'] || row['Task Cate'] || row['Task Category'] || '',
        project: row['project'] || row['Project'] || '',
        startDate: row['startDate'] || row['Start Date'] || '',
        dueDate: row['dueDate'] || row['Due Date'] || '',
        withoutDueDate: row['withoutDueDate'] === 'TRUE' || row['withoutDueDate'] === 'true' || 
                      row['Without D'] === 'Yes' || row['Without Due Date'] === 'Yes' || false,
        assignedTo: row['assignedToEmail'] || row['Assigned'] || row['Assigned To'] || '',
        status: row['status'] || row['Status'] || 'Pending',
        description: row['description'] || row['Descriptic'] || row['Description'] || '',
        responsible: row['responsibleEmails'] || row['Responsib'] || row['Responsible'] || '',
        accountable: row['accountableEmails'] || row['Accountak'] || row['Accountable'] || '',
        consulted: row['consultedEmails'] || row['Consulted'] || '',
        informed: row['informedEmails'] || row['Informed'] || '',
        trained: row['trainedEmployeesEmails'] || row['Trained'] || '',
        labels: row['label'] || row['Labels'] || '',
        milestones: row['milestones'] || row['Milestone'] || row['Milestones'] || '',
        priority: row['priority'] || row['Priority'] || 'Medium',
        complexity: row['complexity'] || row['Complexit'] || row['Complexity'] || '',
        impact: row['impact'] || row['Impact'] || '',
        unit: row['unit'] || row['Unit'] || '',
        target: row['target'] || row['Target'] || '',
        effort_estimate_label: row['effortLabel'] || row['Effort Esti'] || row['Effort Estimate'] || '',
        time_estimate_hours: row['time_estimate_hours'] || row['Time Estimate Hours'] || 0,
        time_estimate_minutes: row['time_estimate_minutes'] || row['Time Estimate Minutes'] || 0,
        makePrivate: row['isPrivate'] === 'TRUE' || row['isPrivate'] === 'true' || 
                   row['Make Priv'] === 'Yes' || row['Make Private'] === 'Yes' || false,
        share: row['isShared'] === 'TRUE' || row['isShared'] === 'true' || 
              row['Share'] === 'Yes' || false,
        repeat: row['isRepeating'] === 'TRUE' || row['isRepeating'] === 'true' || 
               row['Repeat'] === 'Yes' || false,
        isDependent: row['isDependent'] === 'TRUE' || row['isDependent'] === 'true' || 
                    row['Task is de'] === 'Yes' || row['Task is dependent'] === 'Yes' || false,
        validationBy: row['validationBy'] || row['Validatior'] || row['Validation By'] || '',
        effortLabel: row['effortLabel'] || row['Effort Lab Ch'] || row['Effort Label'] || '',
        checklist: row['checklist'] || row['Checklist'] || '',
        workflowGuide: row['workflowGuide'] || row['Workflow Guide'] || '',
        createdOn: row['createdOn'] || row['Created On'] || row['Created At'] || ''
      };

      // Debug logging for first few rows
      if (i < 3) {
        console.log(`\n=== ROW ${i + 1} DEBUG ===`);
        console.log('Raw row data:', row);
        console.log('Parsed taskData:', taskData);
        console.log('Title value:', taskData.title);
      }

      // Validate required fields
      if (!taskData.title || taskData.title.trim() === '') {
        errors.push(`Row ${i + 1}: Title is required`);
        errorCount++;
        continue;
      }

      // Normalize optional Created On value to MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
      const normalizeDateValue = (val) => {
        if (!val) return null;
        let d = null;
        if (val instanceof Date) {
          d = val;
        } else if (typeof val === 'number' && !Number.isNaN(val)) {
          // Excel serial number to JS Date
          d = new Date(Math.round((val - 25569) * 86400 * 1000));
        } else if (typeof val === 'string') {
          const trimmed = val.trim();
          if (!trimmed) return null;
          const parsed = new Date(trimmed);
          if (!Number.isNaN(parsed.getTime())) d = parsed;
        }
        if (!d) return null;
        const pad = (n) => String(n).padStart(2, '0');
        const yyyy = d.getFullYear();
        const mm = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const hh = pad(d.getHours());
        const mi = pad(d.getMinutes());
        const ss = pad(d.getSeconds());
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
      };

      const createdAtValue = normalizeDateValue(taskData.createdOn);

      // Insert task using MySQL (conditionally include created_at if provided)
      const baseColumns = [
        'title', 'department', 'task_category', 'project', 'start_date', 'due_date', 'without_due_date',
        'assigned_to', 'status', 'description', 'responsible', 'accountable', 'consulted', 'informed', 'trained',
        'labels', 'milestones', 'priority', 'complexity', 'impact', 'unit', 'target', 'effort_estimate_label',
        'time_estimate_hours', 'time_estimate_minutes', 'make_private', 'share', '`repeat`', '`is_dependent`',
        'validation_by', 'effort_label', 'checklist', 'workflow_guide'
      ];
      const baseValues = [
        taskData.title, taskData.department, taskData.taskCategory, taskData.project,
        taskData.startDate, taskData.dueDate, taskData.withoutDueDate ? 1 : 0,
        taskData.assignedTo, taskData.status, taskData.description,
        taskData.responsible, taskData.accountable, taskData.consulted, taskData.informed, taskData.trained,
        taskData.labels, taskData.milestones, taskData.priority, taskData.complexity, taskData.impact,
        taskData.unit || '', taskData.target || '', taskData.effort_estimate_label,
        taskData.time_estimate_hours || 0, taskData.time_estimate_minutes || 0,
        taskData.makePrivate ? 1 : 0, taskData.share ? 1 : 0, taskData.repeat ? 1 : 0, taskData.isDependent ? 1 : 0,
        taskData.validationBy, taskData.effortLabel, taskData.checklist, taskData.workflowGuide
      ];

      const columns = [...baseColumns];
      const values = [...baseValues];
      if (createdAtValue) {
        columns.push('created_at');
        values.push(createdAtValue);
      }

      const placeholders = columns.map(() => '?').join(', ');
      const insertQuery = `
        INSERT INTO tasks (${columns.join(', ')})
        VALUES (${placeholders})
      `;

      try {
        // Debug logging to see exact values
        console.log(`\n=== ROW ${i + 1} DEBUG ===`);
        console.log('Query:', insertQuery);
        console.log('Values:', values);
        console.log('Values length:', values.length);
        
        await mysqlPool.execute(insertQuery, values);
        successCount++;
        console.log(`Row ${i + 1} imported successfully`);
      } catch (err) {
        errorCount++;
        errors.push(`Row ${i + 1}: ${err.message}`);
        console.error(`Import error for row ${i + 1}:`, err.message);
        console.error('Full error:', err);
      }
    }
    // Send response after all rows are processed
    res.json({
      message: `Import completed. ${successCount} tasks imported successfully. ${errorCount} errors.`,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Error processing file' });
  }
});
// Update existing tasks from file
app.post('/api/tasks/update', upload.single('file'), async (req, res) => {
  console.log('=== TASK UPDATE REQUEST RECEIVED ===');
  console.log('Request headers:', req.headers);
  console.log('Request body keys:', Object.keys(req.body || {}));
  console.log('File received:', req.file ? 'YES' : 'NO');
  
  if (!req.file) {
    console.log('No file uploaded - returning 400 error');
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const taskId = row['Task ID'] || row['task_id'] || row['id'];
      
      if (!taskId) {
        errorCount++;
        errors.push(`Row ${i + 2}: Task ID is required for updates`);
        continue;
      }
      
      try {
        // Check if task exists
        const checkQuery = 'SELECT id FROM tasks WHERE id = ?';
        const [existingTasks] = await connection.execute(checkQuery, [taskId]);
        
        if (existingTasks.length === 0) {
          errorCount++;
          errors.push(`Row ${i + 2}: Task with ID ${taskId} not found`);
          continue;
        }
        
        // Build update query dynamically based on provided fields
        const updateFields = [];
        const updateValues = [];
        
        const fieldMappings = {
          'Title': 'title',
          'Description': 'description',
          'Status': 'status',
          'Priority': 'priority',
          'Complexity': 'complexity',
          'Impact': 'impact',
          'Unit': 'unit',
          'Target': 'target',
          'Effort Estimate': 'effort_estimate_label',
          'Time Estimate (Hours)': 'time_estimate_hours',
          'Time Estimate (Minutes)': 'time_estimate_minutes',
          'Due Date': 'due_date',
          'Start Date': 'start_date',
          'Assigned To': 'assigned_to',
          'Department': 'department',
          'Labels': 'labels',
          'Checklist': 'checklist',
          'Workflow Guide': 'workflow_guide'
        };
        
        Object.entries(fieldMappings).forEach(([excelField, dbField]) => {
          if (row[excelField] !== undefined && row[excelField] !== null && row[excelField] !== '') {
            updateFields.push(`${dbField} = ?`);
            updateValues.push(row[excelField]);
          }
        });
        
        if (updateFields.length === 0) {
          errorCount++;
          errors.push(`Row ${i + 2}: No valid fields to update`);
          continue;
        }
        
        updateValues.push(taskId);
        
        const updateQuery = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
        await connection.execute(updateQuery, updateValues);
        
        successCount++;
        console.log(`Updated task ${taskId} successfully`);
        
      } catch (error) {
        console.error(`Error updating task ${taskId}:`, error);
        errorCount++;
        errors.push(`Row ${i + 2}: Error updating task ${taskId} - ${error.message}`);
      }
    }
    
    res.json({
      message: `Update completed. ${successCount} tasks updated successfully. ${errorCount} errors.`,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error processing update file:', error);
    res.status(500).json({ error: 'Error processing update file' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
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
  // Check employee login
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
    
    // PHASE 2: Fetch user permissions from roles table
    let userPermissions = [];
    if (employee.user_role) {
      try {
        const [rolePermissions] = await connection.execute(`
          SELECT permissions FROM roles WHERE name = ? AND status = 'Active'
        `, [employee.user_role]);
        
        if (rolePermissions.length > 0) {
          try {
            userPermissions = rolePermissions[0].permissions ? JSON.parse(rolePermissions[0].permissions) : [];
          } catch (e) {
            console.error('Error parsing permissions for role:', employee.user_role, e);
            userPermissions = [];
          }
        }
      } catch (err) {
        console.error('Error fetching role permissions:', err);
        userPermissions = [];
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
        permissions: userPermissions  // PHASE 2: Include user permissions
      }
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Get user profile
app.get('/api/auth/profile', async (req, res) => {
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
      if (connection) {
        connection.release();
      }
    }
  } else {
    res.status(400).json({ error: 'Invalid request' });
  }
});

// Roles API endpoints
app.get('/api/roles', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/roles', async (req, res) => {
  let connection;
  try {
    const { name, description, permissions } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Check if role name already exists
    const checkQuery = 'SELECT id FROM roles WHERE name = ?';
    const [existing] = await connection.execute(checkQuery, [name]);
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Role name already exists' });
    }
    
    const insertQuery = 'INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?)';
    const [result] = await connection.execute(insertQuery, [
      name, 
      description || '', 
      JSON.stringify(permissions || [])
    ]);
    
    // Fetch the created role
    const [newRole] = await connection.execute('SELECT * FROM roles WHERE id = ?', [result.insertId]);
    
    res.status(201).json(newRole[0]);
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
app.put('/api/roles/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }
    
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Check if role exists
    const [existing] = await connection.execute('SELECT id FROM roles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Check if new name conflicts with other roles
    const [nameConflict] = await connection.execute('SELECT id FROM roles WHERE name = ? AND id != ?', [name, id]);
    if (nameConflict.length > 0) {
      return res.status(400).json({ error: 'Role name already exists' });
    }
    
    const updateQuery = 'UPDATE roles SET name = ?, description = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await connection.execute(updateQuery, [
      name, 
      description || '', 
      JSON.stringify(permissions || []), 
      id
    ]);
    
    // Fetch the updated role
    const [updatedRole] = await connection.execute('SELECT * FROM roles WHERE id = ?', [id]);
    
    res.json(updatedRole[0]);
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
app.delete('/api/roles/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Check if role exists
    const [existing] = await connection.execute('SELECT id FROM roles WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    // Check if role is assigned to any employees
    const [employeesWithRole] = await connection.execute('SELECT COUNT(*) as count FROM employees WHERE user_role = (SELECT name FROM roles WHERE id = ?)', [id]);
    
    if (employeesWithRole[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete role. It is assigned to employees. Please reassign employees first.' 
      });
    }
    
    // Soft delete by setting status to Inactive
    await connection.execute('UPDATE roles SET status = "Inactive", updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    
    res.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('Error deleting role:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Permissions API endpoints
app.get('/api/permissions', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});

// Task History API endpoint - REMOVED DUPLICATE

// Task Timesheet API endpoint
app.get('/api/tasks/:id/timesheet', async (req, res) => {
  const taskId = req.params.id;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT 
        tt.*,
        -- Format datetime for display using MySQL DATE_FORMAT (timestamps are already in Pakistan timezone)
        DATE_FORMAT(tt.start_time, '%a %d %b %Y %H:%i') as formatted_start_time,
        DATE_FORMAT(tt.end_time, '%a %d %b %Y %H:%i') as formatted_end_time,
        -- Use hours_logged if available, otherwise calculate from start_time and end_time
        CASE 
          WHEN tt.hours_logged > 0 THEN tt.hours_logged
          WHEN tt.start_time IS NOT NULL AND tt.end_time IS NOT NULL THEN 
            TIMESTAMPDIFF(SECOND, tt.start_time, tt.end_time)
          ELSE 0
        END as hours_logged_seconds
      FROM task_timesheet tt
      WHERE tt.task_id = ?
      ORDER BY tt.start_time DESC
    `;
    
    const [results] = await connection.execute(query, [taskId]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching task timesheet:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// DWM report aggregated completions per day - Using MySQL version above
// DWM report details: list tasks and time for a given day/category and completion state
app.get('/api/reports/dwm/details', async (req, res) => {
  const { date, category, department, employee, completed } = req.query;
  if (!date || !category) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) and category (daily|weekly|monthly) are required' });
  }
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Common WHERE for category + filters
    const params = [date];
    let categoryWhere = '';
    if (category === 'daily') {
      categoryWhere = " AND lower(IFNULL(t.labels,'')) LIKE '%daily%'";
    } else if (category === 'weekly') {
      const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      categoryWhere = ' AND t.title LIKE ?';
      params.push(`%(${dayName})%`);
    } else if (category === 'monthly') {
      const dom = new Date(date + 'T00:00:00').getDate();
      categoryWhere = ' AND lower(t.title) LIKE ?';
      params.push(`%(${dom} of month)%`);
    } else {
      return res.status(400).json({ error: 'Invalid category' });
    }

    let filterWhere = '';
    if (department) { filterWhere += ' AND t.department = ?'; params.push(department); }
    if (employee) { filterWhere += " AND IFNULL(t.assigned_to,'') LIKE ?"; params.push(`%${employee}%`); }

    const wantCompleted = String(completed).toLowerCase() === 'true';

    if (wantCompleted) {
      // Completed tasks on that date (from history)
      const q = `
        SELECT t.id, t.title, t.status, t.labels, t.priority,
               COALESCE(SUM(CASE WHEN date(ts.start_time) = ? THEN ts.hours_logged ELSE 0 END), 0) AS seconds
        FROM task_history th
        JOIN tasks t ON t.id = th.task_id
        LEFT JOIN task_timesheet ts ON ts.task_id = t.id
        WHERE th.action = 'Status changed'
          AND th.new_value = 'Completed'
          AND date(th.created_at) = ?
          ${categoryWhere}
          ${filterWhere}
        GROUP BY t.id, t.title, t.status
        ORDER BY t.title
      `;
      // Provide date for ts.start_time AND for th.created_at, then category/filter params
      const execParams = [date, date, ...params.slice(1)];
      const [rows] = await connection.execute(q, execParams);
      const totalSeconds = rows.reduce((s, r) => s + (r.seconds || 0), 0);
      res.json({ items: rows, totalSeconds });
    } else {
      // Not completed (candidate tasks minus those completed that day)
      const candidatesQ = `
        SELECT t.id, t.title, t.status, t.labels, t.priority
        FROM tasks t
        WHERE 1=1 ${categoryWhere} ${filterWhere}
      `;
      const [candidateTasks] = await connection.execute(candidatesQ, params.slice(1));
      
      if (candidateTasks.length === 0) return res.json({ items: [], totalSeconds: 0 });
      
      const ids = candidateTasks.map(t => t.id);
      const placeholders = ids.map(() => '?').join(',');
      const completedQ = `
        SELECT DISTINCT task_id FROM task_history
        WHERE action = 'Status changed' AND new_value = 'Completed' AND date(created_at) = ?
          AND task_id IN (${placeholders})
      `;
      const [compRows] = await connection.execute(completedQ, [date, ...ids]);
      
      const compSet = new Set(compRows.map(r => r.task_id));
      const items = candidateTasks.filter(t => !compSet.has(t.id));
      res.json({ items, totalSeconds: 0 });
    }
  } catch (err) {
    console.error('Error in DWM report details:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// DWM Incomplete Tasks Notifications API
app.get('/api/notifications/dwm-incomplete', async (req, res) => {
  const { date } = req.query;
  
  if (!date) {
    return res.status(400).json({ error: 'date parameter is required (YYYY-MM-DD)' });
  }

  // Check if user has dwm_view permission
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  
  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  // Check if user has dwm_view permission or is admin
  if (!permissions.includes('dwm_view') && !permissions.includes('all') && userRole !== 'admin') {
    console.log(`Access denied: User role ${userRole} attempted to access DWM notifications without permission`);
    return res.status(403).json({ 
      error: 'Access denied. You do not have permission to view DWM notifications.',
      requiredPermission: 'dwm_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Parse the date to get day of week and day of month
    const targetDate = new Date(date + 'T00:00:00');
    const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
    const dayOfMonth = targetDate.getDate();
    
    console.log(`🔔 DWM Notifications: Checking for date ${date} (${dayOfWeek}, ${dayOfMonth} of month)`);

    // First, let's check what DWM tasks exist in the database
    const debugQuery = `
      SELECT id, title, labels, status, department, assigned_to
      FROM tasks 
      WHERE LOWER(IFNULL(labels,'')) LIKE '%daily%'
         OR LOWER(IFNULL(labels,'')) LIKE '%weekly%'
         OR LOWER(IFNULL(labels,'')) LIKE '%monthly%'
    `;
    
    const [debugRows] = await connection.execute(debugQuery);
    console.log('🔔 DWM Debug: Found DWM tasks in database:', debugRows);

    // Check specific task ID 148 to see its data
    const task148Query = `SELECT id, title, labels, status, department, assigned_to FROM tasks WHERE id = 148`;
    const [task148Rows] = await connection.execute(task148Query);
    console.log('🔔 DWM Debug: Task 148 data:', task148Rows);

    // Check for tasks assigned to Hamza Nadeem in procurement department
    const hamzaQuery = `SELECT id, title, labels, status, department, assigned_to FROM tasks WHERE assigned_to LIKE '%Hamza Nadeem%' AND department LIKE '%Procurement%'`;
    const [hamzaRows] = await connection.execute(hamzaQuery);
    console.log('🔔 DWM Debug: Hamza Nadeem procurement tasks:', hamzaRows);

    // Check for tasks with "apparel" in the title
    const apparelQuery = `SELECT id, title, labels, status, department, assigned_to FROM tasks WHERE LOWER(title) LIKE '%apparel%'`;
    const [apparelRows] = await connection.execute(apparelQuery);
    console.log('🔔 DWM Debug: Apparel tasks:', apparelRows);
    // Check task history for completion tracking
    const historyQuery = `SELECT task_id, action, new_value, created_at FROM task_history WHERE action = 'Status changed' AND new_value = 'Completed' AND DATE(CONVERT_TZ(created_at, '+00:00', '+05:00')) = ? ORDER BY created_at DESC LIMIT 10`;
    const [historyRows] = await connection.execute(historyQuery, [date]);
    console.log('🔔 DWM Debug: Recent completions on', date, ':', historyRows);
    // Also check if there are any tasks with 'Daily Task' in the title
    const dailyTitleQuery = `SELECT id, title, labels, status FROM tasks WHERE LOWER(title) LIKE '%daily task%'`;
    const [dailyTitleRows] = await connection.execute(dailyTitleQuery);
    console.log('🔔 DWM Debug: Tasks with "Daily Task" in title:', dailyTitleRows);
    // Query to find incomplete DWM tasks that were ACTUALLY due on the specified date
    const query = `
      SELECT DISTINCT
        t.id,
        t.title,
        t.description,
        t.department,
        t.assigned_to,
        t.labels,
        t.priority,
        t.status,
        '${date}' as date,
        CASE 
          WHEN (
            LOWER(IFNULL(t.labels,'')) LIKE '%daily%' 
            OR LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%'
            OR LOWER(t.title) LIKE '%daily%'
            OR LOWER(t.title) LIKE '%daily task%'
          ) THEN 'Daily'
          WHEN (
            t.title LIKE '%(${dayOfWeek})%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%'
            OR LOWER(t.title) LIKE '%weekly%'
            OR LOWER(t.title) LIKE '%weekly task%'
          ) THEN 'Weekly'
          WHEN (
            LOWER(t.title) LIKE '%(${dayOfMonth} of month)%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%'
            OR LOWER(t.title) LIKE '%monthly%'
            OR LOWER(t.title) LIKE '%monthly task%'
          ) THEN 'Monthly'
          ELSE 'Unknown'
        END as task_type
      FROM tasks t
      WHERE (
        -- Daily tasks: always due (check both labels and title)
        (
          LOWER(IFNULL(t.labels,'')) LIKE '%daily%' 
          OR LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%'
          OR LOWER(t.title) LIKE '%daily%'
          OR LOWER(t.title) LIKE '%daily task%'
        )
        -- Weekly tasks: only due on their specific day (check both labels and title)
        OR (
          t.title LIKE '%(${dayOfWeek})%'
          OR (
            (LOWER(IFNULL(t.labels,'')) LIKE '%weekly%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%'
            OR LOWER(t.title) LIKE '%weekly%'
            OR LOWER(t.title) LIKE '%weekly task%')
            AND (
              ('${dayOfWeek}' = 'Monday' AND (t.title LIKE '%Monday%' OR t.title LIKE '%(Monday)%'))
              OR ('${dayOfWeek}' = 'Tuesday' AND (t.title LIKE '%Tuesday%' OR t.title LIKE '%(Tuesday)%'))
              OR ('${dayOfWeek}' = 'Wednesday' AND (t.title LIKE '%Wednesday%' OR t.title LIKE '%(Wednesday)%'))
              OR ('${dayOfWeek}' = 'Thursday' AND (t.title LIKE '%Thursday%' OR t.title LIKE '%(Thursday)%'))
              OR ('${dayOfWeek}' = 'Friday' AND (t.title LIKE '%Friday%' OR t.title LIKE '%(Friday)%'))
              OR ('${dayOfWeek}' = 'Saturday' AND (t.title LIKE '%Saturday%' OR t.title LIKE '%(Saturday)%'))
              OR ('${dayOfWeek}' = 'Sunday' AND (t.title LIKE '%Sunday%' OR t.title LIKE '%(Sunday)%'))
            )
          )
        )
        -- Monthly tasks: only due on their specific date (check both labels and title)
        OR (
          LOWER(t.title) LIKE '%(${dayOfMonth} of month)%'
          OR (
            (LOWER(IFNULL(t.labels,'')) LIKE '%monthly%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
            OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%'
            OR LOWER(t.title) LIKE '%monthly%'
            OR LOWER(t.title) LIKE '%monthly task%')
            AND (
              t.title LIKE '%${dayOfMonth}%'
              OR t.title LIKE '%(${dayOfMonth} of month)%'
            )
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM task_history th 
        WHERE th.task_id = t.id 
        AND th.action = 'Status changed' 
        AND th.new_value = 'Completed' 
        AND DATE(CONVERT_TZ(th.created_at, '+00:00', '+05:00')) = ?
      )
      -- Additional check: also exclude tasks that were completed on the same day based on updated_at
      AND NOT (
        t.status = 'Completed' 
        AND DATE(CONVERT_TZ(t.updated_at, '+00:00', '+05:00')) = ?
      )
      ORDER BY t.priority DESC, t.department, t.assigned_to
    `;

    console.log('🔔 DWM Debug: Executing query with date parameter:', date);
    const [rows] = await connection.execute(query, [date, date]);
    console.log('🔔 DWM Debug: Query result rows:', rows);

    // Format the response for the frontend
    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      employeeName: row.assigned_to || 'Unassigned',
      taskType: row.task_type,
      priority: row.priority || 'Medium',
      status: row.status,
      date: row.date,
      labels: row.labels
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching DWM incomplete notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Ticket Notifications API Routes
app.get('/api/notifications', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT 
        tn.id,
        tn.user_id,
        tn.ticket_id,
        tn.notification_type,
        tn.title,
        tn.message,
        tn.is_read,
        tn.created_at,
        tn.read_at,
        t.ticket_number,
        t.title as ticket_title
      FROM ticket_notifications tn
      LEFT JOIN tickets t ON tn.ticket_id = t.id
      WHERE tn.user_id = ?
      ORDER BY tn.created_at DESC
      LIMIT 50
    `;

    const [notifications] = await connection.execute(query, [user_id]);
    res.json(notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/notifications/unread-count', async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      SELECT COUNT(*) as unread_count
      FROM ticket_notifications
      WHERE user_id = ? AND is_read = FALSE
    `;

    const [result] = await connection.execute(query, [user_id]);
    res.json({ unread_count: result[0].unread_count });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      UPDATE ticket_notifications 
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const [result] = await connection.execute(query, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.put('/api/notifications/mark-all-read', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      UPDATE ticket_notifications 
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND is_read = FALSE
    `;

    const [result] = await connection.execute(query, [user_id]);

    res.json({
      message: 'All notifications marked as read',
      updated_count: result.affectedRows
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [result] = await connection.execute('DELETE FROM ticket_notifications WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.put('/api/notifications/mark-ticket-read', async (req, res) => {
  const { user_id, ticket_id } = req.body;

  if (!user_id || !ticket_id) {
    return res.status(400).json({ error: 'user_id and ticket_id are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      UPDATE ticket_notifications 
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND ticket_id = ? AND is_read = FALSE
    `;

    const [result] = await connection.execute(query, [user_id, ticket_id]);

    res.json({
      message: 'Ticket notifications marked as read',
      updated_count: result.affectedRows
    });
  } catch (err) {
    console.error('Error marking ticket notifications as read:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/clet-notifications', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('clet_view') && !permissions.includes('all') && userRole !== 'admin') {
    console.log(`Access denied: User role ${userRole} attempted to access CLET notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view CLET notifications.',
      requiredPermission: 'clet_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log('🔔 CLET Notifications: Fetching tasks missing checklist or estimated time');

    const query = `
      SELECT DISTINCT
        t.id,
        t.title,
        t.description,
        t.department,
        t.assigned_to,
        t.labels,
        t.priority,
        t.status,
        t.time_estimate_hours,
        t.time_estimate_minutes,
        t.checklist,
        CASE 
          WHEN LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%' OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%' THEN 'Daily Task'
          WHEN LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%' OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%' THEN 'Weekly Task'
          WHEN LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%' OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%' THEN 'Monthly Task'
          ELSE 'Unknown'
        END as task_type,
        CASE 
          WHEN (t.time_estimate_hours IS NULL OR t.time_estimate_hours = 0) 
               AND (t.time_estimate_minutes IS NULL OR t.time_estimate_minutes = 0)
               AND (t.checklist IS NULL OR t.checklist = '' OR t.checklist = '[]' OR t.checklist = 'null') 
          THEN 'Both Missing'
          WHEN (t.time_estimate_hours IS NULL OR t.time_estimate_hours = 0) 
               AND (t.time_estimate_minutes IS NULL OR t.time_estimate_minutes = 0)
          THEN 'Estimated Time Missing'
          WHEN (t.checklist IS NULL OR t.checklist = '' OR t.checklist = '[]' OR t.checklist = 'null') 
          THEN 'Checklist Missing'
          ELSE 'Unknown'
        END as missing_type
      FROM tasks t
      WHERE (
        LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
        OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
        OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
        OR LOWER(IFNULL(t.labels,'')) LIKE '%daily task%'
        OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly task%'
        OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly task%'
      )
      AND (
        ((t.time_estimate_hours IS NULL OR t.time_estimate_hours = 0) 
         AND (t.time_estimate_minutes IS NULL OR t.time_estimate_minutes = 0))
        OR (t.checklist IS NULL OR t.checklist = '' OR t.checklist = '[]' OR t.checklist = 'null')
      )
      AND t.status != 'Completed'
      ORDER BY t.priority DESC, t.department, t.assigned_to
    `;

    console.log('🔔 CLET Debug: Executing CLET query');
    const [rows] = await connection.execute(query);
    console.log('🔔 CLET Debug: Query result rows:', rows.length);

    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      employeeName: row.assigned_to || 'Unassigned',
      taskType: row.task_type,
      priority: row.priority || 'Medium',
      status: row.status,
      labels: row.labels,
      timeEstimateHours: row.time_estimate_hours,
      timeEstimateMinutes: row.time_estimate_minutes,
      checklist: row.checklist,
      missingType: row.missing_type
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching CLET notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/notifications/consecutive-absences', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('ca_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    console.log(`Access denied: User role ${userRole} attempted to access CA notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view CA notifications.',
      requiredPermission: 'ca_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log('🔔 Consecutive Absence Notifications: Fetching employees with consecutive absences');

    const [employees] = await connection.execute(`
      SELECT id, name, email, department FROM employees
    `);

    const consecutiveAbsenceEmployees = [];

    for (const employee of employees) {
      const [attendanceRecords] = await connection.execute(`
        SELECT date 
        FROM attendance 
        WHERE employee_id = ? 
        AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ORDER BY date DESC
      `, [employee.id]);

      const presentDates = new Set(attendanceRecords.map(record => record.date.toISOString().split('T')[0]));

      let maxConsecutiveAbsentDays = 0;
      let currentConsecutiveAbsentDays = 0;

      for (let i = 0; i < 30; i++) {
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        const dateString = checkDate.toISOString().split('T')[0];

        if (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
          continue;
        }

        if (presentDates.has(dateString)) {
          currentConsecutiveAbsentDays = 0;
        } else {
          currentConsecutiveAbsentDays++;
          maxConsecutiveAbsentDays = Math.max(maxConsecutiveAbsentDays, currentConsecutiveAbsentDays);
        }
      }

      if (maxConsecutiveAbsentDays >= 3) {
        const lastAttendanceDate = attendanceRecords[0]?.date || null;
        consecutiveAbsenceEmployees.push({
          id: employee.id,
          employeeName: employee.name,
          employeeEmail: employee.email,
          department: employee.department || 'Unassigned',
          consecutiveAbsentDays: maxConsecutiveAbsentDays,
          lastAttendanceDate: lastAttendanceDate,
          daysSinceLastAttendance: lastAttendanceDate ? 
            Math.floor((new Date() - new Date(lastAttendanceDate)) / (1000 * 60 * 60 * 24)) : 
            null
        });
      }
    }

    console.log(`🔔 Consecutive Absence Debug: Found ${consecutiveAbsenceEmployees.length} employees with consecutive absences`);

    res.json(consecutiveAbsenceEmployees);
  } catch (err) {
    console.error('Error fetching consecutive absence notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/notifications/missed-tasks', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { days = 7 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('mtw_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    console.log(`Access denied: User role ${userRole} attempted to access MTW notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view MTW notifications.',
      requiredPermission: 'mtw_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log(`🔔 MTW Notifications: Fetching tasks missed for ${days} days`);

    const query = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.department,
        t.assigned_to,
        t.priority,
        t.status,
        t.created_at,
        t.updated_at,
        t.due_date,
        t.labels,
        DATEDIFF(CURDATE(), t.created_at) as days_since_creation
      FROM tasks t
      WHERE 
        t.status != 'Completed'
        AND DATEDIFF(CURDATE(), t.created_at) >= ?
        AND (
          LOWER(IFNULL(t.labels,'')) NOT LIKE '%daily%'
          AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%weekly%'
          AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%monthly%'
          AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%daily-task%'
          AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%weekly-task%'
          AND LOWER(IFNULL(t.labels,'')) NOT LIKE '%monthly-task%'
        )
      ORDER BY t.department, t.priority DESC, t.created_at ASC
    `;

    console.log('🔔 MTW Debug: Executing query with days parameter:', days);
    const [rows] = await connection.execute(query, [parseInt(days)]);
    console.log(`🔔 MTW Debug: Query result rows: ${rows.length}`);

    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      assignedTo: row.assigned_to || 'Unassigned',
      priority: row.priority || 'Medium',
      status: row.status,
      createdDate: row.created_at,
      updatedDate: row.updated_at,
      dueDate: row.due_date,
      labels: row.labels,
      daysSinceCreation: row.days_since_creation
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching MTW notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/notifications/less-trained-employees', async (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userPermissions = req.headers['x-user-permissions'];
  const { minTrained = 3 } = req.query;

  if (!userRole || !userPermissions) {
    return res.status(401).json({ error: 'User role and permissions required' });
  }

  let permissions;
  try {
    permissions = JSON.parse(userPermissions);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid permissions format' });
  }

  if (!permissions.includes('lte_view') && !permissions.includes('all') && userRole !== 'admin' && userRole !== 'Admin') {
    console.log(`Access denied: User role ${userRole} attempted to access LTE notifications without permission`);
    return res.status(403).json({
      error: 'Access denied. You do not have permission to view LTE notifications.',
      requiredPermission: 'lte_view'
    });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    console.log(`🔔 LTE Notifications: Fetching DWM tasks with less than ${minTrained} trained employees`);

    const query = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.department,
        t.assigned_to,
        t.priority,
        t.status,
        t.created_at,
        t.updated_at,
        t.due_date,
        t.labels,
        t.trained,
        CASE 
          WHEN LOWER(IFNULL(t.labels,'')) LIKE '%daily%' OR LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%' THEN 'Daily'
          WHEN LOWER(IFNULL(t.labels,'')) LIKE '%weekly%' OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%' THEN 'Weekly'
          WHEN LOWER(IFNULL(t.labels,'')) LIKE '%monthly%' OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%' THEN 'Monthly'
          ELSE 'Unknown'
        END as task_type,
        CASE 
          WHEN t.trained IS NULL OR t.trained = '' OR t.trained = 'null' THEN 0
          ELSE JSON_LENGTH(t.trained)
        END as trained_count
      FROM tasks t
      WHERE 
        (
          LOWER(IFNULL(t.labels,'')) LIKE '%daily%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%daily-task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%weekly-task%'
          OR LOWER(IFNULL(t.labels,'')) LIKE '%monthly-task%'
        )
        AND (
          t.trained IS NULL 
          OR t.trained = '' 
          OR t.trained = 'null'
          OR JSON_LENGTH(t.trained) < ?
        )
      ORDER BY t.department, t.priority DESC, t.created_at ASC
    `;

    console.log('🔔 LTE Debug: Executing query with minTrained parameter:', minTrained);
    const [rows] = await connection.execute(query, [parseInt(minTrained)]);
    console.log(`🔔 LTE Debug: Query result rows: ${rows.length}`);

    const formattedNotifications = rows.map(row => ({
      id: row.id,
      taskTitle: row.title,
      taskDescription: row.description,
      department: row.department || 'Unassigned',
      assignedTo: row.assigned_to || 'Unassigned',
      priority: row.priority || 'Medium',
      status: row.status,
      createdDate: row.created_at,
      updatedDate: row.updated_at,
      dueDate: row.due_date,
      labels: row.labels,
      taskType: row.task_type,
      trained: row.trained,
      trainedCount: row.trained_count,
      requiredCount: parseInt(minTrained)
    }));

    res.json(formattedNotifications);
  } catch (err) {
    console.error('Error fetching LTE notifications:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});



// Helper: reset recurring tasks to Pending (labels include daily/weekly/monthly)
async function resetRecurringTasks(callback) {
  const sql = `
    UPDATE tasks
    SET status = 'Pending', updated_at = CURRENT_TIMESTAMP
    WHERE LOWER(IFNULL(labels,'')) LIKE '%daily%'
       OR LOWER(IFNULL(labels,'')) LIKE '%weekly%'
       OR LOWER(IFNULL(labels,'')) LIKE '%monthly%'
  `;
  try {
    const [result] = await mysqlPool.execute(sql);
    if (typeof callback === 'function') callback(null, result.affectedRows);
  } catch (err) {
    if (typeof callback === 'function') callback(err, 0);
  }
}

// Manual trigger endpoint (simple, no auth yet)
app.post('/api/admin/reset-recurring', async (req, res) => {
  try {
    await resetRecurringTasks((err, changes) => {
    if (err) {
      console.error('Manual recurring reset failed:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Recurring tasks reset to Pending', rowsAffected: changes || 0, at: new Date().toISOString() });
  });
  } catch (error) {
    console.error('Manual recurring reset failed:', error);
    res.status(500).json({ error: 'Database error' });
  }
});
// ===== Daily reset of recurring tasks (Pakistan time) =====
// Reset status to Pending at local midnight in Asia/Karachi for tasks labeled daily/weekly/monthly
(function setupDailyRecurringTaskReset() {
  const timeZone = 'Asia/Karachi';
  const getYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let lastYmd = getYmd();

  const resetTasks = async () => {
    await resetRecurringTasks((err, changes) => {
      if (err) {
        console.error('Recurring task daily reset failed:', err);
      } else {
        console.log(`Recurring tasks reset to Pending for new PK date. Rows affected: ${changes}`);
      }
    });
  };

  setInterval(() => {
    try {
      const current = getYmd();
      if (current !== lastYmd) {
        resetTasks();
        lastYmd = current;
      }
    } catch (e) {
      console.error('Recurring reset scheduler error:', e);
    }
  }, 60 * 1000); // check every minute
})();

app.get('/api/warning-letter-types', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/warning-letter-types', async (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const insert = 'INSERT INTO warning_letter_types (name) VALUES (?)';
    const [result] = await connection.execute(insert, [String(name).trim()]);

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
    if (connection) {
      connection.release();
    }
  }
});

app.get('/api/warning-letters', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});

// Delete multiple warning letters (bulk delete)
app.delete('/api/warning-letters/bulk', async (req, res) => {
  const { ids } = req.body;
  console.log('Bulk delete warning letters request - IDs:', ids);
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs array is required' });
  }
  
  // Validate that all IDs are numbers
  const numericIds = ids.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));
  if (numericIds.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }
  
  const placeholders = numericIds.map(() => '?').join(',');
  const query = `DELETE FROM warning_letters WHERE id IN (${placeholders})`;
  
  console.log('Bulk delete warning letters query:', query, 'with params:', numericIds);
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const [result] = await connection.execute(query, numericIds);
    console.log('Bulk delete warning letters result - affected rows:', result.affectedRows);
    res.json({ 
      message: `${result.affectedRows} warning letter(s) deleted successfully`,
      deletedCount: result.affectedRows 
    });
  } catch (err) {
      console.error('Error deleting warning letters:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Get warning letters for a specific employee
app.get('/api/employees/:id/warning-letters', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});

// Create new warning letter
app.post('/api/warning-letters', async (req, res) => {
  const { employee_id, title, description, warning_date, severity } = req.body;
  if (!employee_id || !title) {
    return res.status(400).json({ error: 'employee_id and title are required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Get employee name
    const [employees] = await connection.execute('SELECT name FROM employees WHERE id = ?', [employee_id]);
    if (employees.length === 0) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    const employee_name = employees[0].name;
    
    // Insert warning letter record
    const insert = `INSERT INTO warning_letters (employee_id, employee_name, title, description, warning_date, severity) VALUES (?, ?, ?, ?, ?, ?)`;
    const [result] = await connection.execute(insert, [employee_id, employee_name, title, description || '', warning_date || null, severity || 'Low']);
    
    // Get the created warning letter record
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
    if (connection) {
      connection.release();
    }
  }
});
// Update warning letter
app.put('/api/warning-letters/:id', async (req, res) => {
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
    if (connection) {
      connection.release();
    }
  }
});

// Delete warning letter
app.delete('/api/warning-letters/:id', async (req, res) => {
  const warningLetterId = req.params.id;
  let connection;
  
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const query = 'DELETE FROM warning_letters WHERE id = ?';
    await connection.execute(query, [warningLetterId]);
    
    res.json({ message: 'Warning letter deleted successfully' });
  } catch (err) {
    console.error('Error deleting warning letter:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Tickets API Routes
// Get all tickets
app.get('/api/tickets', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Get user permissions and info from headers
    const userPermissions = req.headers['user-permissions'] ? JSON.parse(req.headers['user-permissions']) : [];
    const userRole = req.headers['user-role'] || 'employee';
    const userId = req.headers['user-id'] || '';
    const userName = req.headers['user-name'] || '';

    // Debug logging
    console.log('🔍 Backend Debug - Tickets API Request:', {
      headers: req.headers,
      userPermissions: userPermissions,
      userRole: userRole,
      userId: userId,
      userName: userName
    });

    let query = `
      SELECT 
        t.id,
        t.ticket_number,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.status,
        t.assigned_to,
        t.department,
        t.created_by,
        t.created_at,
        t.updated_at,
        e1.name as assigned_to_name,
        e2.name as created_by_name,
        d.name as department_name
      FROM tickets t
      LEFT JOIN employees e1 ON t.assigned_to = e1.id
      LEFT JOIN employees e2 ON t.created_by = e2.id
      LEFT JOIN departments d ON t.department = d.name
      WHERE 1=1
    `;
    
    const params = [];

    // Check permissions for ticket viewing
    const hasViewAllTickets = userPermissions.includes('all') || userPermissions.includes('view_tickets');
    const hasViewOwnTickets = userPermissions.includes('view_own_tickets');

    if (hasViewOwnTickets && !hasViewAllTickets) {
      // User can only see own tickets - filter by created_by or assigned_to
      query += ' AND (t.created_by = ? OR t.assigned_to = ?)';
      params.push(userId, userId);
      console.log(`🔒 Filtering tickets for user ${userName} (ID: ${userId}) - only showing own tickets`);
    } else if (hasViewAllTickets) {
      console.log(`🔓 User has view all tickets permission - showing all tickets`);
    } else {
      console.log(`⚠️  User has no ticket viewing permissions - showing no tickets`);
      query += ' AND 1=0'; // Show no tickets
    }

    query += ' ORDER BY t.created_at DESC';

    // Debug logging - show final query and params
    console.log('🔍 Backend Debug - Final Query:', query);
    console.log('🔍 Backend Debug - Query Params:', params);

    const [tickets] = await connection.execute(query, params);
    console.log(`🔍 Backend Debug - Query returned ${tickets.length} tickets`);
    
    res.json(tickets);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Create new ticket
app.post('/api/tickets', async (req, res) => {
  const { title, description, category, priority, assigned_to, department, created_by } = req.body;
  
  if (!title || !category) {
    return res.status(400).json({ error: 'Title and category are required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Generate ticket number (format: TKT-YYYYMMDD-XXX)
    const today = new Date();
    const dateStr = today.getFullYear().toString() + 
                   (today.getMonth() + 1).toString().padStart(2, '0') + 
                   today.getDate().toString().padStart(2, '0');
    
    // Get count of tickets for today
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as count FROM tickets WHERE DATE(created_at) = CURDATE()'
    );
    const count = countResult[0].count + 1;
    const ticketNumber = `TKT-${dateStr}-${count.toString().padStart(3, '0')}`;
    
    // Insert ticket
    const insertQuery = `
      INSERT INTO tickets (ticket_number, title, description, category, priority, status, assigned_to, department, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await connection.execute(insertQuery, [
      ticketNumber,
      title,
      description || '',
      category,
      priority || 'Medium',
      'Open',
      assigned_to || null,
      department || null,
      created_by || null
    ]);
    
    // Get the created ticket with full details
    const selectQuery = `
      SELECT 
        t.id,
        t.ticket_number,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.status,
        t.assigned_to,
        t.department,
        t.created_by,
        t.created_at,
        t.updated_at,
        e1.name as assigned_to_name,
        e2.name as created_by_name,
        d.name as department_name
      FROM tickets t
      LEFT JOIN employees e1 ON t.assigned_to = e1.id
      LEFT JOIN employees e2 ON t.created_by = e2.id
      LEFT JOIN departments d ON t.department = d.name
      WHERE t.id = ?
    `;
    
    const [tickets] = await connection.execute(selectQuery, [result.insertId]);
    
    if (tickets.length > 0) {
      const newTicket = tickets[0];
      
      // Create notification for assigned user if ticket is assigned
      if (assigned_to) {
        console.log('Creating notification for assigned user:', assigned_to, 'ticket:', newTicket.id);
        await createNotification(
          assigned_to,
          newTicket.id,
          'new_ticket_assigned',
          'New Ticket Assigned',
          `You have been assigned a new ticket: ${newTicket.title}`
        );
        console.log('Notification created successfully');
      } else {
        console.log('No assigned user, skipping notification creation');
      }
      
      res.status(201).json(newTicket);
    } else {
      res.status(201).json({ id: result.insertId, ticket_number: ticketNumber, message: 'Ticket created successfully' });
    }
  } catch (err) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Get single ticket
app.get('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const query = `
      SELECT 
        t.id,
        t.ticket_number,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.status,
        t.assigned_to,
        t.department,
        t.created_by,
        t.created_at,
        t.updated_at,
        e1.name as assigned_to_name,
        e2.name as created_by_name,
        d.name as department_name
      FROM tickets t
      LEFT JOIN employees e1 ON t.assigned_to = e1.id
      LEFT JOIN employees e2 ON t.created_by = e2.id
      LEFT JOIN departments d ON t.department = d.name
      WHERE t.id = ?
    `;
    
    const [tickets] = await connection.execute(query, [id]);
    
    if (tickets.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    res.json(tickets[0]);
  } catch (err) {
    console.error('Error fetching ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Update ticket
app.put('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, category, priority, status, assigned_to, department } = req.body;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Check if ticket exists
    const [existing] = await connection.execute('SELECT id FROM tickets WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Update ticket
    const updateQuery = `
      UPDATE tickets SET 
        title = ?, description = ?, category = ?, priority = ?, status = ?, 
        assigned_to = ?, department = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await connection.execute(updateQuery, [
      title, description, category, priority, status, assigned_to, department, id
    ]);
    
    // Get updated ticket
    const selectQuery = `
      SELECT 
        t.id,
        t.ticket_number,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.status,
        t.assigned_to,
        t.department,
        t.created_by,
        t.created_at,
        t.updated_at,
        e1.name as assigned_to_name,
        e2.name as created_by_name,
        d.name as department_name
      FROM tickets t
      LEFT JOIN employees e1 ON t.assigned_to = e1.id
      LEFT JOIN employees e2 ON t.created_by = e2.id
      LEFT JOIN departments d ON t.department = d.name
      WHERE t.id = ?
    `;
    
    const [tickets] = await connection.execute(selectQuery, [id]);
    
    if (tickets.length > 0) {
      res.json(tickets[0]);
    } else {
      res.json({ message: 'Ticket updated successfully' });
    }
  } catch (err) {
    console.error('Error updating ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Delete ticket
app.delete('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  console.log('Delete ticket request received for ID:', id);
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    console.log('Attempting to delete ticket with ID:', id);
    const [result] = await connection.execute('DELETE FROM tickets WHERE id = ?', [id]);
    
    console.log('Delete result:', result);
    
    if (result.affectedRows === 0) {
      console.log('No ticket found with ID:', id);
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    console.log('Ticket deleted successfully, affected rows:', result.affectedRows);
    res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Ticket Replies API Routes

// Get all replies for a ticket
app.get('/api/tickets/:id/replies', async (req, res) => {
  const { id } = req.params;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const query = `
      SELECT 
        tr.id,
        tr.ticket_id,
        tr.replied_by,
        tr.replied_by_name,
        tr.reply_text,
        tr.reply_type,
        tr.is_internal,
        tr.created_at,
        tr.updated_at
      FROM ticket_replies tr
      WHERE tr.ticket_id = ?
      ORDER BY tr.created_at ASC
    `;
    
    const [replies] = await connection.execute(query, [id]);
    res.json(replies);
  } catch (err) {
    console.error('Error fetching ticket replies:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Add a reply to a ticket
app.post('/api/tickets/:id/replies', upload.any(), async (req, res) => {
  const { id } = req.params;
  const { reply_text, reply_type, is_internal, replied_by, replied_by_name } = req.body;
  
  if (!reply_text || !replied_by || !replied_by_name) {
    return res.status(400).json({ error: 'Reply text, replied_by, and replied_by_name are required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Check if ticket exists
    const [ticketExists] = await connection.execute('SELECT id FROM tickets WHERE id = ?', [id]);
    if (ticketExists.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Insert reply
    const insertQuery = `
      INSERT INTO ticket_replies (ticket_id, replied_by, replied_by_name, reply_text, reply_type, is_internal)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await connection.execute(insertQuery, [
      id,
      replied_by,
      replied_by_name,
      reply_text,
      reply_type || 'customer_reply',
      is_internal || false
    ]);
    
    // Get the created reply
    const selectQuery = `
      SELECT 
        tr.id,
        tr.ticket_id,
        tr.replied_by,
        tr.replied_by_name,
        tr.reply_text,
        tr.reply_type,
        tr.is_internal,
        tr.created_at,
        tr.updated_at
      FROM ticket_replies tr
      WHERE tr.id = ?
    `;
    
    const [replies] = await connection.execute(selectQuery, [result.insertId]);
    
    if (replies.length > 0) {
      const newReply = replies[0];
      
      // Handle file uploads if any
      if (req.files && req.files.length > 0) {
        console.log('Processing file uploads:', req.files.length, 'files');
        
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, 'uploads', 'ticket-attachments');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const attachmentPaths = [];
        
        for (const file of req.files) {
          // Generate unique filename
          const fileExtension = path.extname(file.originalname);
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
          const filePath = path.join(uploadsDir, fileName);
          
          // Save file
          fs.writeFileSync(filePath, file.buffer);
          attachmentPaths.push({
            originalName: file.originalname,
            fileName: fileName,
            filePath: filePath,
            size: file.size,
            mimeType: file.mimetype
          });
          
          console.log('File saved:', file.originalname, 'as', fileName);
        }
        
        // Store attachment info in the reply (you might want to create a separate table for this)
        // For now, we'll store it as JSON in a field or create a simple text representation
        const attachmentInfo = JSON.stringify(attachmentPaths);
        
        // Update the reply with attachment info
        await connection.execute(
          'UPDATE ticket_replies SET reply_text = CONCAT(reply_text, ?) WHERE id = ?',
          [`\n\n[Attachments: ${attachmentPaths.map(a => a.originalName).join(', ')}]`, result.insertId]
        );
      }
      
      // Get ticket details to create notifications
      const [ticketDetails] = await connection.execute('SELECT * FROM tickets WHERE id = ?', [id]);
      if (ticketDetails.length > 0) {
        const ticket = ticketDetails[0];
        const usersToMarkUnread = [];
        
        // Create notification for ticket creator (if different from reply author)
        if (ticket.created_by && ticket.created_by !== replied_by) {
          await createNotification(
            ticket.created_by,
            ticket.id,
            'new_reply',
            'New Reply',
            `New reply added to ticket: ${ticket.title}`
          );
          usersToMarkUnread.push(ticket.created_by);
        }
        
        // Create notification for assigned user (if different from reply author and ticket creator)
        if (ticket.assigned_to && ticket.assigned_to !== replied_by && ticket.assigned_to !== ticket.created_by) {
          await createNotification(
            ticket.assigned_to,
            ticket.id,
            'new_reply',
            'New Reply',
            `New reply added to ticket: ${ticket.title}`
          );
          usersToMarkUnread.push(ticket.assigned_to);
        }
        
        // Mark ticket as unread for users who received notifications
        if (usersToMarkUnread.length > 0) {
          try {
            // Mark all notifications for this ticket as unread for the specified users
            for (const user_id of usersToMarkUnread) {
              await connection.execute(
                'UPDATE ticket_notifications SET is_read = false, read_at = NULL WHERE user_id = ? AND ticket_id = ?',
                [user_id, id]
              );
            }
            console.log('Ticket marked as unread for users:', usersToMarkUnread);
          } catch (err) {
            console.error('Error marking ticket as unread:', err);
          }
        }
      }
      
      res.status(201).json(newReply);
    } else {
      res.status(201).json({ id: result.insertId, message: 'Reply added successfully' });
    }
  } catch (err) {
    console.error('Error adding ticket reply:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Update a reply
app.put('/api/tickets/:ticketId/replies/:replyId', async (req, res) => {
  const { ticketId, replyId } = req.params;
  const { reply_text, reply_type, is_internal } = req.body;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Check if reply exists
    const [existing] = await connection.execute('SELECT id FROM ticket_replies WHERE id = ? AND ticket_id = ?', [replyId, ticketId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Reply not found' });
    }
    
    // Update reply
    const updateQuery = `
      UPDATE ticket_replies SET 
        reply_text = ?, reply_type = ?, is_internal = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND ticket_id = ?
    `;
    
    await connection.execute(updateQuery, [reply_text, reply_type, is_internal, replyId, ticketId]);
    
    // Get updated reply
    const selectQuery = `
      SELECT 
        tr.id,
        tr.ticket_id,
        tr.replied_by,
        tr.replied_by_name,
        tr.reply_text,
        tr.reply_type,
        tr.is_internal,
        tr.created_at,
        tr.updated_at
      FROM ticket_replies tr
      WHERE tr.id = ?
    `;
    
    const [replies] = await connection.execute(selectQuery, [replyId]);
    
    if (replies.length > 0) {
      res.json(replies[0]);
    } else {
      res.json({ message: 'Reply updated successfully' });
    }
  } catch (err) {
    console.error('Error updating ticket reply:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Delete a reply
app.delete('/api/tickets/:ticketId/replies/:replyId', async (req, res) => {
  const { ticketId, replyId } = req.params;
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    const [result] = await connection.execute('DELETE FROM ticket_replies WHERE id = ? AND ticket_id = ?', [replyId, ticketId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Reply not found' });
    }
    
    res.json({ message: 'Reply deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket reply:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Change password endpoint
app.post('/api/auth/change-password', async (req, res) => {
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

    // Handle hardcoded admin user specially
    if (email === 'admin@daataadirect.co.uk') {
      // For hardcoded admin, check if user exists in database
      let adminUser = null;
      
      try {
        const [adminRows] = await connection.execute(
          'SELECT id, password FROM employees WHERE email = ?',
          [email]
        );
        
        if (adminRows.length > 0) {
          adminUser = adminRows[0];
        }
      } catch (dbError) {
        console.log('Database query failed for admin:', dbError.message);
      }
      
      // If admin not found in database, create it first
      if (!adminUser) {
        try {
          const [insertResult] = await connection.execute(
            'INSERT INTO employees (name, email, user_role, password, status) VALUES (?, ?, ?, ?, ?)',
            ['Admin User', email, 'Admin', 'admin123', 'Active']
          );
          
          adminUser = {
            id: insertResult.insertId,
            password: 'admin123'
          };
        } catch (insertError) {
          console.log('Failed to create admin user:', insertError.message);
          return res.status(500).json({ error: 'Database error - unable to create admin user' });
        }
      }
      
      // Check current password for admin
      console.log('Admin password check:', {
        storedPassword: adminUser.password,
        providedPassword: currentPassword,
        isStoredMatch: adminUser.password === currentPassword,
        isDefaultMatch: currentPassword === 'admin123',
        isHardcodedMatch: currentPassword === 'Allahrasoolmuhammad'
      });
      // For admin, accept either the stored password, the default 'admin123', or the hardcoded 'Allahrasoolmuhammad'
      const isCurrentPasswordValid = 
        adminUser.password === currentPassword || 
        currentPassword === 'admin123' ||
        currentPassword === 'Allahrasoolmuhammad';
      
      if (!isCurrentPasswordValid) {
        console.log('Password validation failed for admin');
        return res.status(401).json({ 
          error: `Current password is incorrect. Try 'Allahrasoolmuhammad' or 'admin123' as your current password.` 
        });
      }
      // Update password
      await connection.execute(
        'UPDATE employees SET password = ? WHERE email = ?',
        [newPassword, email]
      );
      
      res.json({ success: true, message: 'Password changed successfully' });
    } else {
      // Regular user password change
      const [userRows] = await connection.execute(
        'SELECT id, password FROM employees WHERE email = ? AND status = "Active"',
        [email]
      );

      if (userRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userRows[0];
      
      // Check current password
      if (user.password !== currentPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Update password
      await connection.execute(
        'UPDATE employees SET password = ? WHERE email = ?',
        [newPassword, email]
      );

      res.json({ success: true, message: 'Password changed successfully' });
    }
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Mark a ticket as unread for specific users (when new reply is added)
app.put('/api/tickets/:id/mark-unread', async (req, res) => {
  const { id } = req.params;
  const { user_ids } = req.body; // Array of user IDs to mark as unread
  
  if (!user_ids || !Array.isArray(user_ids)) {
    return res.status(400).json({ error: 'user_ids array is required' });
  }
  
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    
    // Mark all notifications for this ticket as unread for the specified users
    // This ensures the ticket appears as unread in the UI
    for (const user_id of user_ids) {
      await connection.execute(
        'UPDATE ticket_notifications SET is_read = false, read_at = NULL WHERE user_id = ? AND ticket_id = ?',
        [user_id, id]
      );
    }
    
    console.log('Ticket marked as unread for users:', user_ids);
    res.json({ message: 'Ticket marked as unread for specified users' });
  } catch (err) {
    console.error('Error marking ticket as unread:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Helper function to get health settings
async function getHealthSettings(connection) {
  try {
    const [settings] = await connection.execute('SELECT * FROM health_settings');
    const settingsObj = {};
    settings.forEach(setting => {
      let value = setting.setting_value;
      if (setting.setting_type === 'number') {
        value = parseFloat(value);
      } else if (setting.setting_type === 'boolean') {
        value = value === 'true';
      }
      settingsObj[setting.setting_key] = value;
    });
    return settingsObj;
  } catch (err) {
    console.error('Error fetching health settings:', err);
    return {
      top_rated_threshold: 300,
      average_threshold: 200,
      below_standard_threshold: 199,
      task_points_per_day: 2,
      task_cycle_months: 3,
      task_cycle_offset_days: 2,
      hours_points_per_month: 8,
      expected_hours_per_day: 8,
      working_days_per_week: 6,
      hr_cycle_months: 3,
      error_high_deduction: 15,
      error_medium_deduction: 8,
      error_low_deduction: 3,
      appreciation_bonus: 5,
      attendance_deduction: 5,
      max_absences_per_month: 2,
      data_cycle_months: 3,
      warning_letters_deduction: 10,
      warning_letters_cycle_months: 6,
      warning_letters_cycle_offset_days: 0,
      warning_letters_severity_high_deduction: 20,
      warning_letters_severity_medium_deduction: 15,
      warning_letters_severity_low_deduction: 10
    };
  }
}

// Health Settings API Routes
app.get('/api/health-settings', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [settings] = await connection.execute('SELECT * FROM health_settings ORDER BY setting_key');

    const settingsObj = {};
    settings.forEach(setting => {
      let value = setting.setting_value;
      if (setting.setting_type === 'number') {
        value = parseFloat(value);
      } else if (setting.setting_type === 'boolean') {
        value = value === 'true';
      }
      settingsObj[setting.setting_key] = {
        value,
        type: setting.setting_type,
        description: setting.description
      };
    });

    res.json(settingsObj);
  } catch (err) {
    console.error('Error fetching health settings:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
app.put('/api/health-settings', async (req, res) => {
  const settings = req.body;
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const validSettings = [
      'top_rated_threshold', 'average_threshold', 'below_standard_threshold',
      'task_points_per_day', 'task_cycle_months', 'task_cycle_offset_days',
      'hours_points_per_month', 'expected_hours_per_day', 'working_days_per_week', 'hr_cycle_months',
      'error_high_deduction', 'error_medium_deduction', 'error_low_deduction',
      'appreciation_bonus', 'attendance_deduction', 'max_absences_per_month', 'data_cycle_months',
      'warning_letters_deduction', 'warning_letters_cycle_months', 'warning_letters_cycle_offset_days',
      'warning_letters_severity_high_deduction', 'warning_letters_severity_medium_deduction', 'warning_letters_severity_low_deduction'
    ];

    const updateQuery = 'INSERT INTO health_settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type), description = VALUES(description)';

    for (const key of Object.keys(settings)) {
      if (!validSettings.includes(key)) {
        continue;
      }

      const setting = settings[key];
      let value = setting.value;
      if (setting.type === 'number') {
        value = setting.value.toString();
      } else if (setting.type === 'boolean') {
        value = setting.value ? 'true' : 'false';
      } else if (setting.type === 'json') {
        value = JSON.stringify(setting.value);
      }

      await connection.execute(updateQuery, [
        key,
        value,
        setting.type || 'string',
        setting.description || ''
      ]);
    }

    res.json({ message: 'Health settings updated successfully' });
  } catch (err) {
    console.error('Error updating health settings:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/health-settings/reset', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const defaultSettings = {
      top_rated_threshold: '300',
      average_threshold: '200',
      below_standard_threshold: '199',
      task_points_per_day: '2',
      task_cycle_months: '3',
      task_cycle_offset_days: '2',
      hours_points_per_month: '8',
      expected_hours_per_day: '8',
      working_days_per_week: '6',
      hr_cycle_months: '3',
      error_high_deduction: '15',
      error_medium_deduction: '8',
      error_low_deduction: '3',
      appreciation_bonus: '5',
      attendance_deduction: '5',
      max_absences_per_month: '2',
      data_cycle_months: '3',
      warning_letters_deduction: '10',
      warning_letters_cycle_months: '6',
      warning_letters_cycle_offset_days: '0',
      warning_letters_severity_high_deduction: '20',
      warning_letters_severity_medium_deduction: '15',
      warning_letters_severity_low_deduction: '10'
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
      await connection.execute(
        'UPDATE health_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
        [value, key]
      );
    }

    res.json({ message: 'Health settings reset to defaults' });
  } catch (err) {
    console.error('Error resetting health settings:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.post('/api/health-settings/defaults', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const defaults = {
      top_rated_threshold: { value: 300, type: 'number', description: 'Score required to be considered top rated' },
      average_threshold: { value: 200, type: 'number', description: 'Score required to be considered average' },
      below_standard_threshold: { value: 199, type: 'number', description: 'Below this score is considered below standard' },
      task_points_per_day: { value: 2, type: 'number', description: 'Points awarded per task completed per day' },
      task_cycle_months: { value: 3, type: 'number', description: 'Number of months for task evaluation cycle' },
      task_cycle_offset_days: { value: 2, type: 'number', description: 'Offset days for task cycle' },
      hours_points_per_month: { value: 8, type: 'number', description: 'Points awarded per hour worked per month' },
      expected_hours_per_day: { value: 8, type: 'number', description: 'Expected working hours per day' },
      working_days_per_week: { value: 6, type: 'number', description: 'Number of working days per week' },
      hr_cycle_months: { value: 3, type: 'number', description: 'HR cycle length in months' },
      error_high_deduction: { value: 15, type: 'number', description: 'Points deducted for high severity errors' },
      error_medium_deduction: { value: 8, type: 'number', description: 'Points deducted for medium severity errors' },
      error_low_deduction: { value: 3, type: 'number', description: 'Points deducted for low severity errors' },
      appreciation_bonus: { value: 5, type: 'number', description: 'Points awarded for appreciations' },
      attendance_deduction: { value: 5, type: 'number', description: 'Points deducted for attendance issues' },
      max_absences_per_month: { value: 2, type: 'number', description: 'Maximum allowed absences per month' },
      data_cycle_months: { value: 3, type: 'number', description: 'Number of months for data evaluation cycle' },
      warning_letters_deduction: { value: 10, type: 'number', description: 'Points deducted for warning letters' },
      warning_letters_cycle_months: { value: 6, type: 'number', description: 'Number of months for warning letter evaluation' },
      warning_letters_cycle_offset_days: { value: 0, type: 'number', description: 'Offset days for warning letter cycle' },
      warning_letters_severity_high_deduction: { value: 20, type: 'number', description: 'Points deducted for high severity warning letters' },
      warning_letters_severity_medium_deduction: { value: 15, type: 'number', description: 'Points deducted for medium severity warning letters' },
      warning_letters_severity_low_deduction: { value: 10, type: 'number', description: 'Points deducted for low severity warning letters' }
    };

    const insertQuery = 'INSERT INTO health_settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type), description = VALUES(description)';

    for (const [key, setting] of Object.entries(defaults)) {
      await connection.execute(insertQuery, [
        key,
        setting.value.toString(),
        setting.type,
        setting.description
      ]);
    }

    res.json({ message: 'Health settings reset to defaults successfully' });
  } catch (err) {
    console.error('Error resetting health settings to defaults:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Serve React app (catch-all route for SPA) - MUST be last, after all API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start the server after all routes are defined
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
});