const router = require('express').Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { mysqlPool } = require('../config/database');
const { cacheMiddleware } = require('../middleware/cache');
const { sanitizeForMySQL } = require('../helpers/sanitize');

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/departments - List all departments (cached)
router.get('/', cacheMiddleware('departments'), async (req, res) => {
  const query = 'SELECT * FROM departments ORDER BY created_at DESC';
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [results] = await connection.execute(query);
    res.json(results);
  } catch (err) {
    console.error('Error fetching departments:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/departments/:id/dashboard - Department dashboard aggregate
router.get('/:id/dashboard', async (req, res) => {
  const deptId = req.params.id;
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const [deptRows] = await connection.execute('SELECT * FROM departments WHERE id = ?', [deptId]);

    const buildResponse = async (departmentName) => {
      const [employees] = await connection.execute('SELECT * FROM employees WHERE department = ?', [departmentName]);
      const totalEmployees = employees.length;

      const managerNames = employees.filter(e => (e.designation || '').toLowerCase().includes('manager')).map(e => e.name);
      const teamLeadNames = employees.filter(e => (e.designation || '').toLowerCase().includes('team leader')).map(e => e.name);
      const operatorNames = employees.filter(e => {
        const designation = (e.designation || '').toLowerCase();
        return !designation.includes('manager') && !designation.includes('team leader');
      }).map(e => e.name);

      const totalCost = employees.reduce((sum, emp) => {
        const hourlyRate = Number(emp.hourly_rate) || 0;
        let monthlyHours = 0;
        if (emp.employment_type === 'Full-time') {
          monthlyHours = 8 * 26;
        } else if (emp.employment_type === 'Part-time') {
          monthlyHours = 4 * 26;
        } else {
          monthlyHours = 8 * 26;
        }
        return sum + (hourlyRate * monthlyHours);
      }, 0);

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

      const [tasks] = await connection.execute('SELECT * FROM tasks WHERE department = ?', [departmentName]);
      const totalCompleted = tasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
      const totalDaily = tasks.filter(t => (t.labels || '').toLowerCase().includes('daily task')).length;
      const totalWeekly = tasks.filter(t => (t.labels || '').toLowerCase().includes('weekly task')).length;
      const totalMonthly = tasks.filter(t => (t.labels || '').toLowerCase().includes('monthly task')).length;
      const totalPendingExclDWM = tasks.filter(t => {
        const status = (t.status || '').toLowerCase();
        const labels = (t.labels || '').toLowerCase();
        return status !== 'completed' &&
               !labels.includes('daily task') &&
               !labels.includes('weekly task') &&
               !labels.includes('monthly task');
      }).length;

      res.json({
        totalEmployees,
        managerCount: managerNames.length,
        managerNames,
        teamLeadCount: teamLeadNames.length,
        teamLeadNames,
        operatorCount: operatorNames.length,
        operatorNames,
        totalCost: Math.round(totalCost),
        assignedHours: Math.round(assignedHours),
        totalDaily,
        totalWeekly,
        totalMonthly,
        totalPendingExclDWM,
        totalCompleted
      });
    };

    if (deptRows.length > 0) {
      return await buildResponse(deptRows[0].name);
    }

    // Fallback: try by name
    const [byNameRows] = await connection.execute('SELECT name FROM departments WHERE name = ?', [deptId]);
    if (byNameRows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    await buildResponse(byNameRows[0].name);
  } catch (err) {
    console.error('Error in department dashboard:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// GET /api/departments/:id - Get department by ID
router.get('/:id', async (req, res) => {
  const query = 'SELECT * FROM departments WHERE id = ?';
  try {
    const [results] = await mysqlPool.execute(query, [req.params.id]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json(results[0]);
  } catch (err) {
    console.error('Error fetching department:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/departments - Create new department
router.post('/', async (req, res) => {
  const departmentData = req.body;

  const query = `
    INSERT INTO departments (name, description, manager, location, status)
    VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    sanitizeForMySQL(departmentData.name),
    sanitizeForMySQL(departmentData.description),
    sanitizeForMySQL(departmentData.manager),
    sanitizeForMySQL(departmentData.location),
    sanitizeForMySQL(departmentData.status) || 'Active'
  ];

  try {
    const [result] = await mysqlPool.execute(query, values);
    res.status(201).json({ id: result.insertId, message: 'Department created successfully' });
  } catch (err) {
    console.error('Error creating department:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/departments/:id - Update department
router.put('/:id', async (req, res) => {
  const departmentData = req.body;

  const query = `
    UPDATE departments SET
      name = ?, description = ?, manager = ?, location = ?, status = ?
    WHERE id = ?
  `;
  const values = [
    sanitizeForMySQL(departmentData.name),
    sanitizeForMySQL(departmentData.description),
    sanitizeForMySQL(departmentData.manager),
    sanitizeForMySQL(departmentData.location),
    sanitizeForMySQL(departmentData.status),
    req.params.id
  ];

  try {
    const [result] = await mysqlPool.execute(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json({ message: 'Department updated successfully' });
  } catch (err) {
    console.error('Error updating department:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/departments/:id - Delete department
router.delete('/:id', async (req, res) => {
  const query = 'DELETE FROM departments WHERE id = ?';
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();
    const [result] = await connection.execute(query, [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    console.error('Error deleting department:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      res.status(503).json({ error: 'Database connection lost, please try again' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/departments/import - Import departments from Excel
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

    for (let index = 0; index < data.length; index++) {
      const row = data[index];
      const departmentData = {
        name: row['Name'] || row['name'] || '',
        description: row['Description'] || row['description'] || '',
        manager: row['Manager'] || row['manager'] || '',
        location: row['Location'] || row['location'] || '',
        status: row['Status'] || row['status'] || 'Active'
      };

      if (!departmentData.name.trim()) {
        errorCount++;
        errors.push(`Row ${index + 1}: Department name is required`);
        continue;
      }

      const query = `INSERT INTO departments (name, description, manager, location, status) VALUES (?, ?, ?, ?, ?)`;
      const values = [
        departmentData.name,
        departmentData.description,
        departmentData.manager,
        departmentData.location,
        departmentData.status
      ];

      try {
        await mysqlPool.execute(query, values);
        successCount++;
      } catch (err) {
        errorCount++;
        errors.push(`Row ${index + 1}: ${err.message}`);
      }
    }

    res.json({
      message: `Import completed. ${successCount} departments imported successfully. ${errorCount} errors.`,
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
