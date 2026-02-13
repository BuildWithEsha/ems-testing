const router = require('express').Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/labels - List all labels
router.get('/', async (req, res) => {
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
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/labels/:id - Get label by ID
router.get('/:id', async (req, res) => {
  const query = 'SELECT * FROM labels WHERE id = ?';
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [results] = await connection.execute(query, [req.params.id]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'Label not found' });
    }
    res.json(results[0]);
  } catch (err) {
    console.error('Error fetching label:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/labels - Create new label
router.post('/', async (req, res) => {
  const labelData = req.body;
  const query = `INSERT INTO labels (name, description, color, category, status) VALUES (?, ?, ?, ?, ?)`;
  const values = [
    sanitizeForMySQL(labelData.name),
    sanitizeForMySQL(labelData.description),
    sanitizeForMySQL(labelData.color) || '#3B82F6',
    sanitizeForMySQL(labelData.category),
    sanitizeForMySQL(labelData.status) || 'Active'
  ];

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute(query, values);
    res.status(201).json({ id: result.insertId, message: 'Label created successfully' });
  } catch (err) {
    console.error('Error creating label:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Label with this name already exists' });
    } else if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    if (connection) connection.release();
  }
});

// PUT /api/labels/:id - Update label
router.put('/:id', async (req, res) => {
  const labelData = req.body;
  const query = `UPDATE labels SET name = ?, description = ?, color = ?, category = ?, status = ? WHERE id = ?`;
  const values = [
    sanitizeForMySQL(labelData.name),
    sanitizeForMySQL(labelData.description),
    sanitizeForMySQL(labelData.color),
    sanitizeForMySQL(labelData.category),
    sanitizeForMySQL(labelData.status),
    req.params.id
  ];

  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Label not found' });
    }
    res.json({ message: 'Label updated successfully' });
  } catch (err) {
    console.error('Error updating label:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Label with this name already exists' });
    } else if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /api/labels/:id - Delete label
router.delete('/:id', async (req, res) => {
  const query = 'DELETE FROM labels WHERE id = ?';
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute(query, [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Label not found' });
    }
    res.json({ message: 'Label deleted successfully' });
  } catch (err) {
    console.error('Error deleting label:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/labels/import - Import labels from Excel
router.post('/import', upload.single('file'), async (req, res) => {
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

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const labelData = {
          name: row['Name'] || row['name'] || '',
          description: row['Description'] || row['description'] || '',
          color: row['Color'] || row['color'] || '#3B82F6',
          category: row['Category'] || row['category'] || '',
          status: row['Status'] || row['status'] || 'Active'
        };

        if (!labelData.name) {
          errorCount++;
          errors.push(`Row ${i + 1}: Name is required`);
          continue;
        }

        try {
          await connection.execute(
            'INSERT INTO labels (name, description, color, category, status) VALUES (?, ?, ?, ?, ?)',
            [labelData.name, labelData.description, labelData.color, labelData.category, labelData.status]
          );
          successCount++;
        } catch (err) {
          errorCount++;
          if (err.code === 'ER_DUP_ENTRY') {
            errors.push(`Row ${i + 1}: Label "${labelData.name}" already exists`);
          } else {
            errors.push(`Row ${i + 1}: ${err.message}`);
          }
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
      if (connection) connection.release();
    }
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Error processing file' });
  }
});

module.exports = router;
