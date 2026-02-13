const router = require('express').Router();
const { mysqlPool } = require('../config/database');

// Default health settings values
const DEFAULT_SETTINGS = {
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

const VALID_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

// Helper function to get health settings (exported for use by other modules)
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
    // Return defaults on error
    const defaults = {};
    for (const [key, setting] of Object.entries(DEFAULT_SETTINGS)) {
      defaults[key] = setting.value;
    }
    return defaults;
  }
}

// GET /api/health-settings
router.get('/', async (req, res) => {
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
    if (connection) connection.release();
  }
});

// PUT /api/health-settings - Update settings
router.put('/', async (req, res) => {
  const settings = req.body;
  let connection;

  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const updateQuery = `
      INSERT INTO health_settings (setting_key, setting_value, setting_type, description)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type), description = VALUES(description)
    `;

    for (const key of Object.keys(settings)) {
      if (!VALID_SETTING_KEYS.includes(key)) continue;

      const setting = settings[key];
      let value = setting.value;
      if (setting.type === 'number') {
        value = setting.value.toString();
      } else if (setting.type === 'boolean') {
        value = setting.value ? 'true' : 'false';
      } else if (setting.type === 'json') {
        value = JSON.stringify(setting.value);
      }

      await connection.execute(updateQuery, [key, value, setting.type || 'string', setting.description || '']);
    }

    res.json({ message: 'Health settings updated successfully' });
  } catch (err) {
    console.error('Error updating health settings:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/health-settings/reset - Reset to defaults
router.post('/reset', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    for (const [key, setting] of Object.entries(DEFAULT_SETTINGS)) {
      await connection.execute(
        'UPDATE health_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
        [setting.value.toString(), key]
      );
    }

    res.json({ message: 'Health settings reset to defaults' });
  } catch (err) {
    console.error('Error resetting health settings:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/health-settings/defaults - Seed defaults (upsert)
router.post('/defaults', async (req, res) => {
  let connection;
  try {
    connection = await mysqlPool.getConnection();
    await connection.ping();

    const insertQuery = `
      INSERT INTO health_settings (setting_key, setting_value, setting_type, description)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type), description = VALUES(description)
    `;

    for (const [key, setting] of Object.entries(DEFAULT_SETTINGS)) {
      await connection.execute(insertQuery, [key, setting.value.toString(), setting.type, setting.description]);
    }

    res.json({ message: 'Health settings reset to defaults successfully' });
  } catch (err) {
    console.error('Error resetting health settings to defaults:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
module.exports.getHealthSettings = getHealthSettings;
