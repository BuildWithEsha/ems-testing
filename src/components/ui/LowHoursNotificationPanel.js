import React, { useState, useEffect } from 'react';
import { Bell, X, Clock, User, Building, Filter, Search, Download, ChevronDown, ChevronRight, Settings, Calendar } from 'lucide-react';

const LowHoursNotificationPanel = ({ 
  isOpen, 
  onClose, 
  lowHoursNotifications, 
  minHoursThreshold, 
  onUpdateMinHoursThreshold,
  selectedDate,
  onUpdateSelectedDate,
  onUpdateSettings
}) => {
  // Filter states
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    designation: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [tempMinHoursThreshold, setTempMinHoursThreshold] = useState(minHoursThreshold);
  const [tempSelectedDate, setTempSelectedDate] = useState(selectedDate);

  // Sync temp values when opening settings so form shows current threshold and date
  useEffect(() => {
    if (showSettings) {
      setTempMinHoursThreshold(minHoursThreshold);
      setTempSelectedDate(selectedDate);
    }
  }, [showSettings, minHoursThreshold, selectedDate]);

  // Format seconds to HH:MM:SS
  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Format hours for display
  const formatHours = (hours) => {
    return parseFloat(hours).toFixed(1) + 'h';
  };

  // Apply filters to notifications
  const filteredNotifications = (lowHoursNotifications || []).filter(notification => {
    if (filters.searchTerm && !notification.employeeName?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && notification.department !== filters.department) {
      return false;
    }
    if (filters.designation && (notification.designation || '') !== filters.designation) {
      return false;
    }
    return true;
  });

  // Group filtered notifications by department
  const groupedNotifications = filteredNotifications.reduce((acc, notification) => {
    const dept = notification.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(notification);
    return acc;
  }, {});

  const handleDepartmentToggle = (dept) => {
    const newExpanded = new Set(expandedDepartments);
    if (newExpanded.has(dept)) {
      newExpanded.delete(dept);
    } else {
      newExpanded.add(dept);
    }
    setExpandedDepartments(newExpanded);
  };

  const getUniqueValues = (field) => {
    const values = (lowHoursNotifications || []).map(n => n[field]).filter(Boolean);
    return [...new Set(values)];
  };

  const getHoursColor = (loggedHours, requiredHours) => {
    const percentage = (parseFloat(loggedHours) / parseFloat(requiredHours)) * 100;
    if (percentage === 0) return 'bg-red-100 text-red-800';
    if (percentage < 50) return 'bg-red-100 text-red-800';
    if (percentage < 75) return 'bg-orange-100 text-orange-800';
    if (percentage < 100) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const handleSettingsUpdate = () => {
    if (tempMinHoursThreshold >= 1 && tempMinHoursThreshold <= 24) {
      // Single update so fetch uses both new values (avoids race where second fetch used stale threshold)
      if (onUpdateSettings) {
        onUpdateSettings(tempMinHoursThreshold, tempSelectedDate);
      } else {
        onUpdateMinHoursThreshold(tempMinHoursThreshold);
        onUpdateSelectedDate(tempSelectedDate);
      }
      setShowSettings(false);
    }
  };

  const exportNotifications = () => {
    const csvContent = [
      ['Employee Name', 'Employee ID', 'Department', 'Designation', 'Logged Hours', 'Required Hours', 'Shortfall', 'Date'],
      ...filteredNotifications.map(n => [
        n.employeeName || 'N/A',
        n.employeeCode || 'N/A',
        n.department || 'N/A',
        n.designation || 'N/A',
        n.loggedHours || '0',
        n.requiredHours || 'N/A',
        n.shortfallHours || 'N/A',
        n.date || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `low-hours-employees-${selectedDate}-${minHoursThreshold}h-threshold.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-orange-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Low Hours Employees (LHE) Notifications</h2>
              <p className="text-sm text-gray-600">
                Employees who logged less than {minHoursThreshold} hours on {selectedDate}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
              title="Configure settings"
            >
              <Settings className="w-4 h-4" />
              <span>{minHoursThreshold}h min</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Settings */}
        {showSettings && (
          <div className="p-4 bg-orange-50 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Minimum Hours:</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={tempMinHoursThreshold}
                  onChange={(e) => setTempMinHoursThreshold(parseFloat(e.target.value) || 8)}
                  className="w-20 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Date:</label>
                <input
                  type="date"
                  value={tempSelectedDate}
                  onChange={(e) => setTempSelectedDate(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                onClick={handleSettingsUpdate}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Update
              </button>
              <button
                onClick={() => {
                  setTempMinHoursThreshold(minHoursThreshold);
                  setTempSelectedDate(selectedDate);
                  setShowSettings(false);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filters & Actions */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 w-64"
                />
              </div>
              
              {/* Department Filter */}
              <select
                value={filters.department}
                onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">All Departments</option>
                {getUniqueValues('department').map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              {/* Designation Filter */}
              <select
                value={filters.designation}
                onChange={(e) => setFilters({ ...filters, designation: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">All Designations</option>
                {getUniqueValues('designation').map(des => (
                  <option key={des} value={des}>{des}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {filteredNotifications.length} employee{filteredNotifications.length !== 1 ? 's' : ''} below threshold
              </span>
              <button
                onClick={exportNotifications}
                className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Clock className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No Low Hours Employees</p>
              <p className="text-sm">All employees have logged at least {minHoursThreshold} hours on {selectedDate}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedNotifications).map(([department, notifications]) => (
                <div key={department} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Department Header */}
                  <button
                    onClick={() => handleDepartmentToggle(department)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {expandedDepartments.has(department) ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                      <Building className="w-5 h-5 text-gray-500" />
                      <span className="font-medium text-gray-900">{department}</span>
                      <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded-full">
                        {notifications.length} employee{notifications.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>

                  {/* Department Content */}
                  {expandedDepartments.has(department) && (
                    <div className="divide-y divide-gray-100">
                      {notifications.map((notification, idx) => (
                        <div key={`${notification.employeeId}-${idx}`} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3">
                              <User className="w-5 h-5 text-gray-400 mt-1" />
                              <div>
                                <h4 className="font-medium text-gray-900">{notification.employeeName}</h4>
                                <p className="text-sm text-gray-500">
                                  ID: {notification.employeeCode}
                                  {notification.designation ? ` · ${notification.designation}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              {/* Logged Hours - same format as consolidated log report (HH:MM:SS) */}
                              <div className="text-right">
                                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getHoursColor(notification.loggedHours, notification.requiredHours)}`}>
                                  {formatTime(notification.loggedSeconds || 0)} logged
                                </span>
                              </div>
                              {/* Shortfall */}
                              <div className="text-right">
                                <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800">
                                  -{formatTime(notification.shortfallSeconds || 0)} short
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Progress Bar - show total in same format as consolidated report */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>Progress</span>
                              <span>{formatTime(notification.loggedSeconds || 0)} / {notification.requiredHours} hours</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  parseFloat(notification.loggedHours) === 0 ? 'bg-red-500' :
                                  parseFloat(notification.loggedHours) / parseFloat(notification.requiredHours) < 0.5 ? 'bg-red-500' :
                                  parseFloat(notification.loggedHours) / parseFloat(notification.requiredHours) < 0.75 ? 'bg-orange-500' :
                                  'bg-yellow-500'
                                }`}
                                style={{ width: `${Math.min(100, (parseFloat(notification.loggedHours) / parseFloat(notification.requiredHours)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Showing {filteredNotifications.length} of {(lowHoursNotifications || []).length} employees below {minHoursThreshold}h threshold
            </span>
            <span>
              Date: {selectedDate}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LowHoursNotificationPanel;
