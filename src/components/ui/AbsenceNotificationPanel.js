import React, { useState } from 'react';
import { Bell, X, AlertTriangle, User, Calendar, Building, Filter, Search, Download, ChevronDown, ChevronRight } from 'lucide-react';
import MultiSelect from './MultiSelect';

const AbsenceNotificationPanel = ({ isOpen, onClose, absenceNotifications }) => {
  // Debug: Log the notifications data
  console.log('🔔 CA Panel Debug - Received notifications:', absenceNotifications);
  console.log('🔔 CA Panel Debug - Number of notifications:', absenceNotifications?.length || 0);
  
  // Filter states
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    consecutiveDays: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());

  // Helper function for ordinal suffixes (1st, 2nd, 3rd, etc.)
  const getOrdinalSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // Group notifications by department
  const groupedNotifications = absenceNotifications.reduce((acc, notification) => {
    const dept = notification.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(notification);
    return acc;
  }, {});

  // Apply filters to notifications
  const filteredNotifications = absenceNotifications.filter(notification => {
    if (filters.searchTerm && !notification.employeeName?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && notification.department !== filters.department) {
      return false;
    }
    if (filters.consecutiveDays && notification.consecutiveAbsentDays !== parseInt(filters.consecutiveDays)) {
      return false;
    }
    return true;
  });

  // Group filtered notifications by department
  const filteredGroupedNotifications = filteredNotifications.reduce((acc, notification) => {
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
    const values = absenceNotifications.map(n => n[field]).filter(Boolean);
    return [...new Set(values)];
  };

  const exportFilteredNotifications = () => {
    const csvContent = [
      ['Employee Name', 'Department', 'Consecutive Days', 'Last Attendance Date', 'Days Since Last Attendance'],
      ...filteredNotifications.map(n => [
        n.employeeName || 'N/A',
        n.department || 'N/A',
        n.consecutiveAbsentDays || 'N/A',
        n.lastAttendanceDate ? new Date(n.lastAttendanceDate).toLocaleDateString() : 'Never',
        n.daysSinceLastAttendance || 'Unknown'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consecutive-absences-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Bell className="w-6 h-6 text-red-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Consecutive Absence Notifications</h2>
              <p className="text-sm text-gray-600">
                Employees absent for 3+ consecutive working days
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex items-center space-x-2">
              <button
                onClick={exportFilteredNotifications}
                className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Employee</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.searchTerm}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                    placeholder="Search by employee name..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {getUniqueValues('department').map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Consecutive Days</label>
                <select
                  value={filters.consecutiveDays}
                  onChange={(e) => setFilters(prev => ({ ...prev, consecutiveDays: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  <option value="3">3 Days</option>
                  <option value="4">4 Days</option>
                  <option value="5">5+ Days</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Absence Notifications</h3>
              <p className="text-gray-600">
                {absenceNotifications.length === 0 
                  ? "All employees are present or have valid attendance records."
                  : "No notifications match the current filters."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(filteredGroupedNotifications).map(([dept, deptNotifications]) => (
                <div key={dept} className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => handleDepartmentToggle(dept)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <Building className="w-5 h-5 text-gray-500" />
                      <span className="font-medium text-gray-900">{dept}</span>
                      <span className="bg-gray-100 text-gray-700 text-sm px-2 py-1 rounded-full">
                        {deptNotifications.length} employee{deptNotifications.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {expandedDepartments.has(dept) ? (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    )}
                  </button>
                  
                  {expandedDepartments.has(dept) && (
                    <div className="border-t border-gray-200">
                      {deptNotifications.map((notification, index) => (
                        <div key={index} className="p-4 hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <User className="w-5 h-5 text-gray-500" />
                              <div>
                                <h4 className="font-medium text-gray-900">{notification.employeeName}</h4>
                                <p className="text-sm text-gray-600">
                                  Absent for {notification.consecutiveAbsentDays} consecutive working day{notification.consecutiveAbsentDays !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-600">
                                Last working: {notification.lastAttendanceDate ? new Date(notification.lastAttendanceDate).toLocaleDateString() : 'Never'}
                              </div>
                              <div className="text-sm text-gray-600">
                                Days since last attendance: {notification.daysSinceLastAttendance || 'Unknown'}
                              </div>
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
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {filteredNotifications.length} of {absenceNotifications.length} notifications
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AbsenceNotificationPanel;


