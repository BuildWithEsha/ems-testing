import React, { useState } from 'react';
import { Bell, X, AlertTriangle, User, Calendar, Building, Filter, Search, Download, ChevronDown, ChevronRight, Clock, Settings } from 'lucide-react';

const MissedTaskNotificationPanel = ({ isOpen, onClose, missedTaskNotifications, daysThreshold, onUpdateDaysThreshold }) => {
  // Debug: Log the notifications data
  console.log('🔔 MTW Panel Debug - Received notifications:', missedTaskNotifications);
  console.log('🔔 MTW Panel Debug - Number of notifications:', missedTaskNotifications?.length || 0);
  console.log('🔔 MTW Panel Debug - Days threshold:', daysThreshold);
  
  // Filter states
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    priority: '',
    status: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [showDaysSettings, setShowDaysSettings] = useState(false);
  const [tempDaysThreshold, setTempDaysThreshold] = useState(daysThreshold);

  // Group notifications by department
  const groupedNotifications = missedTaskNotifications.reduce((acc, notification) => {
    const dept = notification.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(notification);
    return acc;
  }, {});

  // Apply filters to notifications
  const filteredNotifications = missedTaskNotifications.filter(notification => {
    if (filters.searchTerm && !notification.taskTitle?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && notification.department !== filters.department) {
      return false;
    }
    if (filters.priority && notification.priority !== filters.priority) {
      return false;
    }
    if (filters.status && notification.status !== filters.status) {
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
    const values = missedTaskNotifications.map(n => n[field]).filter(Boolean);
    return [...new Set(values)];
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'in progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'on hold': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDaysThresholdUpdate = () => {
    if (tempDaysThreshold >= 1 && tempDaysThreshold <= 365) {
      onUpdateDaysThreshold(tempDaysThreshold);
      setShowDaysSettings(false);
    }
  };

  const exportFilteredNotifications = () => {
    const csvContent = [
      ['Task Title', 'Department', 'Assigned To', 'Priority', 'Status', 'Days Since Creation', 'Created Date', 'Due Date'],
      ...filteredNotifications.map(n => [
        n.taskTitle || 'N/A',
        n.department || 'N/A',
        n.assignedTo || 'N/A',
        n.priority || 'N/A',
        n.status || 'N/A',
        n.daysSinceCreation || 'N/A',
        n.createdDate ? new Date(n.createdDate).toLocaleDateString() : 'N/A',
        n.dueDate ? new Date(n.dueDate).toLocaleDateString() : 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `missed-tasks-${daysThreshold}-days-${new Date().toISOString().split('T')[0]}.csv`;
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
            <Bell className="w-6 h-6 text-purple-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Missed Task Week (MTW) Notifications</h2>
              <p className="text-sm text-gray-600">
                Tasks created {daysThreshold}+ days ago but not completed (excluding DWM tasks)
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowDaysSettings(!showDaysSettings)}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
              title="Configure days threshold"
            >
              <Settings className="w-4 h-4" />
              <span>{daysThreshold} days</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Days Settings */}
        {showDaysSettings && (
          <div className="p-4 bg-purple-50 border-b border-gray-200">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Days Threshold:</label>
              <input
                type="number"
                min="1"
                max="365"
                value={tempDaysThreshold}
                onChange={(e) => setTempDaysThreshold(parseInt(e.target.value) || 7)}
                className="w-20 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={handleDaysThresholdUpdate}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Update
              </button>
              <button
                onClick={() => {
                  setTempDaysThreshold(daysThreshold);
                  setShowDaysSettings(false);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Task</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={filters.searchTerm}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                    placeholder="Search by task title..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All Departments</option>
                  {getUniqueValues('department').map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={filters.priority}
                  onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All Priorities</option>
                  {getUniqueValues('priority').map(priority => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All Statuses</option>
                  {getUniqueValues('status').map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Missed Task Notifications</h3>
              <p className="text-gray-600">
                {missedTaskNotifications.length === 0 
                  ? `No tasks have been missed for ${daysThreshold}+ days.`
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
                        {deptNotifications.length} task{deptNotifications.length !== 1 ? 's' : ''}
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
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h4 className="font-medium text-gray-900">{notification.taskTitle}</h4>
                                <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(notification.priority)}`}>
                                  {notification.priority}
                                </span>
                                <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(notification.status)}`}>
                                  {notification.status}
                                </span>
                              </div>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p><strong>Assigned to:</strong> {notification.assignedTo}</p>
                                <p><strong>Days since creation:</strong> {notification.daysSinceCreation} days</p>
                                <p><strong>Created:</strong> {notification.createdDate ? new Date(notification.createdDate).toLocaleDateString() : 'N/A'}</p>
                                {notification.dueDate && (
                                  <p><strong>Due:</strong> {new Date(notification.dueDate).toLocaleDateString()}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 ml-4">
                              <div className="text-right text-sm text-gray-500">
                                <div className="flex items-center space-x-1">
                                  <Clock className="w-4 h-4" />
                                  <span>{notification.daysSinceCreation}d</span>
                                </div>
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
              Showing {filteredNotifications.length} of {missedTaskNotifications.length} notifications
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

export default MissedTaskNotificationPanel;
