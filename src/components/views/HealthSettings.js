import React, { useState, useEffect } from 'react';

const HealthSettings = ({ isOpen, onClose, onSave }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/health-settings');
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      const data = await response.json();
      setSettings(data);
    } catch (err) {
      setError('Failed to fetch settings: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: value
      }
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // Prepare settings for API
      const settingsToSave = {};
      Object.keys(settings).forEach(key => {
        settingsToSave[key] = settings[key].value;
      });

      const response = await fetch('/api/health-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsToSave),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSuccess('Settings saved successfully!');
      setTimeout(() => {
        onSave && onSave();
        onClose();
      }, 1500);
    } catch (err) {
      setError('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset all settings to defaults? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await fetch('/api/health-settings/reset', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to reset settings');
      }

      setSuccess('Settings reset to defaults!');
      setTimeout(() => {
        fetchSettings();
      }, 1500);
    } catch (err) {
      setError('Failed to reset settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (key, setting) => {
    if (setting.type === 'number') {
      return (
        <input
          type="number"
          value={setting.value}
          onChange={(e) => handleInputChange(key, parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          min="0"
          step="0.1"
        />
      );
    } else if (setting.type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={setting.value}
          onChange={(e) => handleInputChange(key, e.target.checked)}
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
        />
      );
    } else {
      return (
        <input
          type="text"
          value={setting.value}
          onChange={(e) => handleInputChange(key, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Health Settings Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-red-600">{error}</p>
                </div>
              )}

              {success && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-md p-4">
                  <p className="text-green-600">{success}</p>
                </div>
              )}

              <div className="space-y-8">
                {/* Score Thresholds */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    Score Thresholds
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Top Rated Threshold
                      </label>
                      {renderInput('top_rated_threshold', settings.top_rated_threshold || { value: 300, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Minimum score for TOP RATED EMPLOYEE</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Average Threshold
                      </label>
                      {renderInput('average_threshold', settings.average_threshold || { value: 200, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Minimum score for AVERAGE EMPLOYEE</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Below Standard Threshold
                      </label>
                      {renderInput('below_standard_threshold', settings.below_standard_threshold || { value: 199, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Maximum score for BELOW STANDARD EMPLOYEE</p>
                    </div>
                  </div>
                </div>

                {/* Task Completion Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                    Task Completion Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Points Per Day
                      </label>
                      {renderInput('task_points_per_day', settings.task_points_per_day || { value: 2, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points awarded per day when all tasks are completed</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Task Cycle Months
                      </label>
                      {renderInput('task_cycle_months', settings.task_cycle_months || { value: 3, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Number of months for task management cycle</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Task Cycle Offset Days
                      </label>
                      {renderInput('task_cycle_offset_days', settings.task_cycle_offset_days || { value: 2, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Days to offset task cycle end date from today</p>
                    </div>
                  </div>
                </div>

                {/* Working Hours Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                    Working Hours Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Points Per Month
                      </label>
                      {renderInput('hours_points_per_month', settings.hours_points_per_month || { value: 8, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points awarded per month when full hours are provided</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Expected Hours Per Day
                      </label>
                      {renderInput('expected_hours_per_day', settings.expected_hours_per_day || { value: 8, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Expected working hours per day</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Working Days Per Week
                      </label>
                      {renderInput('working_days_per_week', settings.working_days_per_week || { value: 6, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Number of working days per week (Monday-Saturday)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        HR Cycle Months
                      </label>
                      {renderInput('hr_cycle_months', settings.hr_cycle_months || { value: 3, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Number of months for HR cycle</p>
                    </div>
                  </div>
                </div>

                {/* Error Deduction Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                    Error Deduction Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        High Severity Deduction
                      </label>
                      {renderInput('error_high_deduction', settings.error_high_deduction || { value: 15, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points deducted per high severity error</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Medium Severity Deduction
                      </label>
                      {renderInput('error_medium_deduction', settings.error_medium_deduction || { value: 8, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points deducted per medium severity error</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Low Severity Deduction
                      </label>
                      {renderInput('error_low_deduction', settings.error_low_deduction || { value: 3, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points deducted per low severity error</p>
                    </div>
                  </div>
                </div>

                {/* Appreciation & Attendance Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                    Appreciation & Attendance Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Appreciation Bonus
                      </label>
                      {renderInput('appreciation_bonus', settings.appreciation_bonus || { value: 5, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points awarded per appreciation received</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Attendance Deduction
                      </label>
                      {renderInput('attendance_deduction', settings.attendance_deduction || { value: 5, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points deducted per month with excessive absences</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Absences Per Month
                      </label>
                      {renderInput('max_absences_per_month', settings.max_absences_per_month || { value: 2, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Maximum allowed absences per month before deduction</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data Cycle Months
                      </label>
                      {renderInput('data_cycle_months', settings.data_cycle_months || { value: 3, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Number of months for data cycle (errors, appreciations)</p>
                    </div>
                  </div>
                </div>

                {/* Warning Letters Settings */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-red-600 rounded-full mr-2"></div>
                    Warning Letters Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Warning Letters Cycle Months
                      </label>
                      {renderInput('warning_letters_cycle_months', settings.warning_letters_cycle_months || { value: 6, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Number of months for warning letters cycle</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Warning Letters Cycle Offset Days
                      </label>
                      {renderInput('warning_letters_cycle_offset_days', settings.warning_letters_cycle_offset_days || { value: 0, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Days to offset warning letters cycle end date from today</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default Warning Deduction
                      </label>
                      {renderInput('warning_letters_deduction', settings.warning_letters_deduction || { value: 10, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Default points deducted per warning letter</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        High Severity Deduction
                      </label>
                      {renderInput('warning_letters_severity_high_deduction', settings.warning_letters_severity_high_deduction || { value: 20, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points deducted per high severity warning letter</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Medium Severity Deduction
                      </label>
                      {renderInput('warning_letters_severity_medium_deduction', settings.warning_letters_severity_medium_deduction || { value: 15, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points deducted per medium severity warning letter</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Low Severity Deduction
                      </label>
                      {renderInput('warning_letters_severity_low_deduction', settings.warning_letters_severity_low_deduction || { value: 10, type: 'number' })}
                      <p className="text-xs text-gray-500 mt-1">Points deducted per low severity warning letter</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset to Defaults
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthSettings;
