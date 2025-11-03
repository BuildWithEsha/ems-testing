import React, { useState, useEffect } from 'react';

const EmployeeHealth = ({ employeeId }) => {
  const [healthData, setHealthData] = useState(null);
  const [healthSettings, setHealthSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (employeeId) {
      fetchHealthData();
      fetchHealthSettings();
    }
  }, [employeeId]);

  const fetchHealthData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/employees/${employeeId}/health`);
      if (!response.ok) {
        throw new Error('Failed to fetch health data');
      }
      const data = await response.json();
      setHealthData(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching health data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealthSettings = async () => {
    try {
      const response = await fetch('/api/health-settings');
      if (!response.ok) {
        throw new Error('Failed to fetch health settings');
      }
      const data = await response.json();
      setHealthSettings(data);
    } catch (err) {
      console.error('Error fetching health settings:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">Error loading health data: {error}</p>
        <button
          onClick={fetchHealthData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!healthData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600">No health data available</p>
      </div>
    );
  }

  const { healthScore, rating, ratingColor, calculations, period, cycles } = healthData;

  const getRatingStyle = (color) => {
    const baseClasses = 'text-2xl font-bold text-center p-4 rounded-lg ';
    switch (color) {
      case 'green':
        return baseClasses + 'bg-green-100 text-green-800 border-2 border-green-300';
      case 'orange':
        return baseClasses + 'bg-orange-100 text-orange-800 border-2 border-orange-300';
      case 'red':
        return baseClasses + 'bg-red-100 text-red-800 border-2 border-red-300';
      default:
        return baseClasses + 'bg-gray-100 text-gray-800 border-2 border-gray-300';
    }
  };

  const getScoreBarColor = (score) => {
    const topRatedThreshold = healthSettings?.top_rated_threshold?.value || 300;
    const averageThreshold = healthSettings?.average_threshold?.value || 200;
    
    if (score >= topRatedThreshold) return 'bg-green-500';
    if (score >= averageThreshold) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreTextColor = (score) => {
    const topRatedThreshold = healthSettings?.top_rated_threshold?.value || 300;
    const averageThreshold = healthSettings?.average_threshold?.value || 200;
    
    if (score >= topRatedThreshold) return 'text-green-600';
    if (score >= averageThreshold) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Employee Health Dashboard</h2>
        
        {/* HR Cycle */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">HR Cycle</h3>
          <p className="text-blue-700 text-sm">
            {cycles?.hr?.description}: {new Date(cycles?.hr?.start).toLocaleDateString()} - {new Date(cycles?.hr?.end).toLocaleDateString()}
          </p>
        </div>
        
        {/* Task Management Cycle */}
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-green-800 mb-2">Task Management Cycle</h3>
          <p className="text-green-700 text-sm">
            {cycles?.task?.description}: {new Date(cycles?.task?.start).toLocaleDateString()} - {new Date(cycles?.task?.end).toLocaleDateString()}
          </p>
        </div>
        
        <p className="text-sm text-gray-500 mt-1">
          HR Cycle refreshes monthly on the 1st, Task Cycle updates daily
        </p>
      </div>

      {/* Overall Rating */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className={getRatingStyle(ratingColor)}>
          {rating}
        </div>
      </div>

      {/* Health Score */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Overall Health Score</h3>
        
        {/* Score Display */}
        <div className="text-center mb-6">
          <div className={`text-6xl font-bold ${getScoreTextColor(healthScore)}`}>
            {healthScore}
          </div>
          <div className="text-gray-500 text-sm mt-2">out of {healthSettings?.top_rated_threshold?.value || 300}+ points</div>
        </div>

        {/* Score Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
          <div
            className={`h-4 rounded-full transition-all duration-500 ${getScoreBarColor(healthScore)}`}
            style={{ width: `${Math.min((healthScore / (healthSettings?.top_rated_threshold?.value || 300)) * 100, 100)}%` }}
          ></div>
        </div>

        {/* Score Ranges */}
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Below Standard (0-{healthSettings?.average_threshold?.value - 1 || 199})</span>
          <span>Average ({healthSettings?.average_threshold?.value || 200}-{healthSettings?.top_rated_threshold?.value - 1 || 299})</span>
          <span>Top Rated ({healthSettings?.top_rated_threshold?.value || 300}+)</span>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Task Completion */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
            Task Completion
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Days Completed:</span>
              <span className="font-semibold">{calculations.tasks.completed}/{calculations.tasks.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Score:</span>
              <span className={`font-semibold ${calculations.tasks.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                +{calculations.tasks.score}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {healthSettings?.task_points_per_day?.value || 2} points per day when all daily, weekly, and monthly tasks are completed
            </div>
          </div>
        </div>

        {/* Working Hours */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
              <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
              Working Hours
            </h3>
            <div className="text-right">
              <div className="text-sm text-gray-500">Total Score</div>
              <div className={`text-2xl font-bold ${calculations.hours.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.hours.score}
              </div>
            </div>
          </div>
          
          {/* Monthly Breakdown Table */}
          {calculations.hours.monthlyBreakdown && calculations.hours.monthlyBreakdown.length > 0 ? (
            <div className="mb-4">
              {/* Column Headers */}
              <div className="grid grid-cols-4 gap-4 text-sm font-medium text-gray-700 mb-3 pb-2 border-b border-gray-200">
                <span></span>
                <span>Hours Required</span>
                <span>Hours Provided</span>
                <span>Points Earned</span>
              </div>
              
              {/* Monthly Rows */}
              <div className="space-y-3">
                {calculations.hours.monthlyBreakdown.map((month, index) => (
                  <div key={index} className="grid grid-cols-4 gap-4 text-sm">
                    <span className="font-medium text-gray-800">{month.month}</span>
                    <span className="text-gray-600">{typeof month.required === 'number' ? month.required.toFixed(0) : month.required}</span>
                    <span className="text-gray-600">{typeof month.provided === 'number' ? month.provided.toFixed(0) : month.provided}</span>
                    <span className={`font-semibold ${month.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {month.points}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-4">
              {/* Column Headers */}
              <div className="grid grid-cols-4 gap-4 text-sm font-medium text-gray-700 mb-3 pb-2 border-b border-gray-200">
                <span></span>
                <span>Hours Required</span>
                <span>Hours Provided</span>
                <span>Points Earned</span>
              </div>
              
              {/* Sample Data - Replace with actual data when available */}
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <span className="font-medium text-gray-800">Jun 25</span>
                  <span className="text-gray-600">200</span>
                  <span className="text-gray-600">0</span>
                  <span className="font-semibold text-red-600">0</span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <span className="font-medium text-gray-800">Jul 25</span>
                  <span className="text-gray-600">216</span>
                  <span className="text-gray-600">0</span>
                  <span className="font-semibold text-red-600">0</span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <span className="font-medium text-gray-800">Aug 25</span>
                  <span className="text-gray-600">208</span>
                  <span className="text-gray-600">0</span>
                  <span className="font-semibold text-red-600">0</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="text-xs text-gray-500 mt-3">
            {healthSettings?.hours_points_per_month?.value || 8} points per month when full hours are provided
          </div>
        </div>

        {/* Errors */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
            Error Deductions
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">High Priority:</span>
              <span className="font-semibold text-red-600">{calculations.errors.high} (-{calculations.errors.high * (healthSettings?.error_high_deduction?.value || 5)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Medium Priority:</span>
              <span className="font-semibold text-orange-600">{calculations.errors.medium} (-{calculations.errors.medium * (healthSettings?.error_medium_deduction?.value || 3)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Low Priority:</span>
              <span className="font-semibold text-yellow-600">{calculations.errors.low} (-{calculations.errors.low * (healthSettings?.error_low_deduction?.value || 1)})</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-600">Total Score:</span>
              <span className={`font-semibold ${calculations.errors.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.errors.score}
              </span>
            </div>
          </div>
        </div>

        {/* Appreciations */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
            Appreciations
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Received:</span>
              <span className="font-semibold">{calculations.appreciations.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Score:</span>
              <span className={`font-semibold ${calculations.appreciations.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                +{calculations.appreciations.score}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {healthSettings?.appreciation_bonus?.value || 5} points per appreciation received
            </div>
          </div>
        </div>

        {/* Attendance */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <div className="w-3 h-3 bg-indigo-500 rounded-full mr-2"></div>
            Attendance
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Absences:</span>
              <span className="font-semibold">{calculations.attendance.absences}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Score:</span>
              <span className={`font-semibold ${calculations.attendance.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.attendance.score}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              -{healthSettings?.attendance_deduction?.value || 5} points per month with more than {healthSettings?.max_absences_per_month?.value || 2} absences
            </div>
          </div>
        </div>

        {/* Warning Letters */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <div className="w-3 h-3 bg-red-600 rounded-full mr-2"></div>
            Warning Letters
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">High Severity:</span>
              <span className="font-semibold text-red-600">{calculations.warningLetters?.high || 0} (-{calculations.warningLetters?.high * (healthSettings?.warning_letters_severity_high_deduction?.value || 20) || 0})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Medium Severity:</span>
              <span className="font-semibold text-orange-600">{calculations.warningLetters?.medium || 0} (-{calculations.warningLetters?.medium * (healthSettings?.warning_letters_severity_medium_deduction?.value || 15) || 0})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Low Severity:</span>
              <span className="font-semibold text-yellow-600">{calculations.warningLetters?.low || 0} (-{calculations.warningLetters?.low * (healthSettings?.warning_letters_severity_low_deduction?.value || 10) || 0})</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-600">Total Score:</span>
              <span className={`font-semibold ${calculations.warningLetters?.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {calculations.warningLetters?.score || 0}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              Warning letters affect health score based on severity level
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="bg-white rounded-lg shadow-sm border p-6 flex items-center justify-center">
          <button
            onClick={fetchHealthData}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Health Score
          </button>
        </div>
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">How Your Health Score is Calculated</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <h4 className="font-semibold mb-2">Positive Points:</h4>
            <ul className="space-y-1">
              <li>• Task Completion: +{healthSettings?.task_points_per_day?.value || 2} points per day (all tasks completed)</li>
              <li>• Working Hours: +{healthSettings?.hours_points_per_month?.value || 8} points per month (full hours provided)</li>
              <li>• Appreciations: +{healthSettings?.appreciation_bonus?.value || 5} points per appreciation</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Deductions:</h4>
            <ul className="space-y-1">
              <li>• High Priority Errors: -{healthSettings?.error_high_deduction?.value || 5} points each</li>
              <li>• Medium Priority Errors: -{healthSettings?.error_medium_deduction?.value || 3} points each</li>
              <li>• Low Priority Errors: -{healthSettings?.error_low_deduction?.value || 1} point each</li>
              <li>• Attendance: -{healthSettings?.attendance_deduction?.value || 5} points per month (>{healthSettings?.max_absences_per_month?.value || 2} absences)</li>
              <li>• Warning Letters: -{healthSettings?.warning_letters_severity_high_deduction?.value || 20} (High), -{healthSettings?.warning_letters_severity_medium_deduction?.value || 15} (Medium), -{healthSettings?.warning_letters_severity_low_deduction?.value || 10} (Low)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeHealth;

