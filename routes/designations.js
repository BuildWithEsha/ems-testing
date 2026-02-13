const router = require('express').Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { mysqlPool } = require('../config/database');
const { sanitizeForMySQL } = require('../helpers/sanitize');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/designations - List all designations
router.get('/', async (req, res) => {
  const query = 'SELECT * FROM designations ORDER BY created_at DESC';
  try {
    const [results] = await mysqlPool.execute(query);
    res.json(results);
  } catch (err) {
    console.error('Error fetching designations:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/designations/:id - Get designation by ID
router.get('/:id', async (req, res) => {
  const query = 'SELECT * FROM designations WHERE id = ?';
  try {
    const [results] = await mysqlPool.execute(query, [req.params.id]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'Designation not found' });
    }
    res.json(results[0]);
  } catch (err) {
    console.error('Error fetching designation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/designations - Create new designation
router.post('/', async (req, res) => {
  const d = req.body;
  const query = `INSERT INTO designations (name, description, department, level, status) VALUES (?, ?, ?, ?, ?)`;
  const values = [
    sanitizeForMySQL(d.name),
    sanitizeForMySQL(d.description),
    sanitizeForMySQL(d.department),
    sanitizeForMySQL(d.level),
    sanitizeForMySQL(d.status) || 'Active'
  ];

  try {
    const [result] = await mysqlPool.execute(query, values);
    res.status(201).json({ id: result.insertId, message: 'Designation created successfully' });
  } catch (err) {
    console.error('Error creating designation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/designations/:id - Update designation
router.put('/:id', async (req, res) => {
  const d = req.body;
  const query = `UPDATE designations SET name = ?, description = ?, department = ?, level = ?, status = ? WHERE id = ?`;
  const values = [
    sanitizeForMySQL(d.name),
    sanitizeForMySQL(d.description),
    sanitizeForMySQL(d.department),
    sanitizeForMySQL(d.level),
    sanitizeForMySQL(d.status),
    req.params.id
  ];

  try {
    const [result] = await mysqlPool.execute(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Designation not found' });
    }
    res.json({ message: 'Designation updated successfully' });
  } catch (err) {
    console.error('Error updating designation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/designations/:id - Delete designation
router.delete('/:id', async (req, res) => {
  const query = 'DELETE FROM designations WHERE id = ?';
  try {
    const [result] = await mysqlPool.execute(query, [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Designation not found' });
    }
    res.json({ message: 'Designation deleted successfully' });
  } catch (err) {
    console.error('Error deleting designation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/designations/import - Import from Excel
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

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const values = [
        row['Name'] || row['name'] || '',
        row['Description'] || row['description'] || '',
        row['Department'] || row['department'] || '',
        row['Level'] || row['level'] || '',
        row['Status'] || row['status'] || 'Active'
      ];

      try {
        await mysqlPool.execute(
          'INSERT INTO designations (name, description, department, level, status) VALUES (?, ?, ?, ?, ?)',
          values
        );
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

module.exports = router;
