const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');

// GET /api/notices - List notices with role-based filtering
router.get('/', async (req, res) => {
  const { user_id, user_role } = req.query;
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.query(
      "SET SESSION sql_mode = (SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))"
    );
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
          const [name, filePath, size, type] = attachment.split(':');
          return { name, path: filePath, size: parseInt(size, 10), type };
        });
      }

      return notice;
    });

    res.json(notices);
  } catch (err) {
    console.error('Error fetching notices:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/notices/unread-count - Get unread notice count for a user
router.get('/unread-count', async (req, res) => {
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
    if (connection) connection.release();
  }
});

// GET /api/notices/:id - Get single notice with recipients and attachments
router.get('/:id', async (req, res) => {
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
    if (connection) connection.release();
  }
});

// POST /api/notices - Create a new notice with recipients and attachments
router.post('/', async (req, res) => {
  const { title, description, priority, status, recipients, attachments, created_by } = req.body;

  if (!title || !description || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({ error: 'Title, description, and recipients are required' });
  }

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const query = `
      INSERT INTO notices (title, description, priority, status, recipients, attachments, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [noticeResult] = await connection.execute(
      query,
      [sanitizeForMySQL(title), sanitizeForMySQL(description), sanitizeForMySQL(priority) || 'medium', status || 'draft', sanitizeForMySQL(created_by)]
    );

    const noticeId = noticeResult.insertId;

    for (const recipient of recipients) {
      const recipientQuery = `
        INSERT INTO notice_recipients (notice_id, recipient_type, recipient_id, recipient_name)
        VALUES (?, ?, ?, ?)
      `;
      await connection.execute(
        recipientQuery,
        [noticeId, sanitizeForMySQL(recipient.type), sanitizeForMySQL(recipient.value), sanitizeForMySQL(recipient.label)]
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
          [noticeId, sanitizeForMySQL(attachment.name), sanitizeForMySQL(attachment.path), attachment.size, sanitizeForMySQL(attachment.type), sanitizeForMySQL(created_by)]
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
    if (connection) connection.release();
  }
});

// PUT /api/notices/:id - Update notice with recipients and attachments
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, priority, status, recipients, attachments } = req.body;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    await connection.beginTransaction();

    const normalizedStatus = (status || 'draft').toLowerCase();

    const noticeQuery = `
      UPDATE notices
      SET title = ?, description = ?, priority = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await connection.execute(
      noticeQuery,
      [sanitizeForMySQL(title), sanitizeForMySQL(description), sanitizeForMySQL(priority), normalizedStatus, id]
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
          [id, sanitizeForMySQL(recipient.type), sanitizeForMySQL(recipient.value), sanitizeForMySQL(recipient.label)]
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
          [id, sanitizeForMySQL(attachment.name), sanitizeForMySQL(attachment.path), attachment.size, sanitizeForMySQL(attachment.type), sanitizeForMySQL(attachment.uploaded_by)]
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
    if (connection) connection.release();
  }
});

// DELETE /api/notices/:id - Delete a notice
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    // Verify notice exists
    const [check] = await connection.execute('SELECT id FROM notices WHERE id = ?', [id]);
    if (check.length === 0) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    await connection.beginTransaction();
    try {
      // Delete child rows first to avoid orphaned data
      await connection.execute('DELETE FROM notice_recipients WHERE notice_id = ?', [id]);
      await connection.execute('DELETE FROM notice_attachments WHERE notice_id = ?', [id]);
      await connection.execute('DELETE FROM notices WHERE id = ?', [id]);
      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    }

    res.json({ message: 'Notice deleted successfully' });
  } catch (err) {
    console.error('Error deleting notice:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/notices/:id/mark-read - Mark a notice as read for a user
router.post('/:id/mark-read', async (req, res) => {
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
    if (connection) connection.release();
  }
});

// POST /api/notices/upload - Upload notice attachments (disk storage)
router.post('/upload', async (req, res) => {
  const diskUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'notice-attachments');
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
      fileSize: 10 * 1024 * 1024 // 10MB
    }
  }).array('files', 10);

  diskUpload(req, res, (err) => {
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

module.exports = router;
