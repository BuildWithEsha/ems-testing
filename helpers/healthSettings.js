// Helper to get health settings from database
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
    // Return defaults if health_settings table doesn't exist yet
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

module.exports = { getHealthSettings };