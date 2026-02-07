import React, { useState } from 'react';
import { X, AlertTriangle, Building, User, Briefcase, Filter, Search, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useDraggableModal } from '../../hooks/useDraggableModal';

const CLETNotificationPanel = ({ isOpen, onClose, cletNotifications }) => {
  // Filter states
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    taskType: '',
    missingType: '',
    priority: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());

  // Group notifications by department
  const groupedNotifications = cletNotifications.reduce((acc, notification) => {
    const dept = notification.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(notification);
    return acc;
  }, {});

  // Apply filters to notifications
  const filteredNotifications = cletNotifications.filter(notification => {
    if (filters.searchTerm && !notification.taskTitle?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && notification.department !== filters.department) {
      return false;
    }
    if (filters.taskType && notification.taskType !== filters.taskType) {
      return false;
    }
    if (filters.missingType && notification.missingType !== filters.missingType) {
      return false;
    }
    if (filters.priority && notification.priority !== filters.priority) {
      return false;
    }
    return true;
  });

  // Group filtered notifications by department
  const groupedFilteredNotifications = filteredNotifications.reduce((acc, notification) => {
    const dept = notification.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(notification);
    return acc;
  }, {});

  const toggleDepartment = (department) => {
    const newExpanded = new Set(expandedDepartments);
    if (newExpanded.has(department)) {
      newExpanded.delete(department);
    } else {
      newExpanded.add(department);
    }
    setExpandedDepartments(newExpanded);
  };

  const getUniqueValues = (field) => {
    const values = cletNotifications.map(n => n[field]).filter(Boolean);
    return [...new Set(values)];
  };

  const exportFilteredNotifications = () => {
    const csvContent = [
      ['Task Title', 'Department', 'Employee', 'Task Type', 'Missing Type', 'Priority', 'Status'],
      ...filteredNotifications.map(n => [
        n.taskTitle || 'N/A',
        n.department || 'N/A',
        n.employeeName || 'N/A',
        n.taskType || 'N/A',
        n.missingType || 'N/A',
        n.priority || 'N/A',
        n.status || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clet-missing-tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getMissingTypeIcon = (missingType) => {
    switch (missingType) {
      case 'Both Missing':
        return '⚠️';
      case 'Estimated Time Missing':
        return '⏰';
      case 'Checklist Missing':
        return '📋';
      default:
        return '❓';
    }
  };

  const getMissingTypeColor = (missingType) => {
    switch (missingType) {
      case 'Both Missing':
        return 'text-red-600 bg-red-100';
      case 'Estimated Time Missing':
        return 'text-orange-600 bg-orange-100';
      case 'Checklist Missing':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (!isOpen) return null;

  const { modalRef, modalStyle, dragHandleProps } = useDraggableModal(isOpen);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={modalRef} style={modalStyle} className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header - drag to move */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50 cursor-move" {...dragHandleProps}>
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-purple-500" />
            <h2 className="text-xl font-semibold text-gray-900">
              CLET - Missing Checklist/Estimated Time
            </h2>
            <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {filteredNotifications.length} / {cletNotifications.length}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'
              }`}
              title="Toggle Filters"
            >
              <Filter className="w-5 h-5" />
            </button>
            <button
              onClick={exportFilteredNotifications}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Export to CSV"
            >
              <Download className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Filters Section */}
        {showFilters && (
          <div className="border-b border-gray-200 bg-gray-50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={filters.searchTerm}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                    placeholder="Search tasks..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Departments</option>
                  {getUniqueValues('department').map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
                <select
                  value={filters.taskType}
                  onChange={(e) => setFilters(prev => ({ ...prev, taskType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Types</option>
                  {getUniqueValues('taskType').map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Missing Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Missing Type</label>
                <select
                  value={filters.missingType}
                  onChange={(e) => setFilters(prev => ({ ...prev, missingType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Missing Types</option>
                  {getUniqueValues('missingType').map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={filters.priority}
                  onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Priorities</option>
                  {getUniqueValues('priority').map(priority => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No CLET notifications found</p>
              <p className="text-sm">All tasks with Daily/Weekly/Monthly labels have proper checklist and estimated time.</p>
            </div>
          ) : (
            <div className="p-6">
              {Object.entries(groupedFilteredNotifications)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([department, deptNotifications]) => (
                  <div key={department} className="mb-6">
                    {/* Department Header */}
                    <button
                      onClick={() => toggleDepartment(department)}
                      className="flex items-center justify-between w-full p-4 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Building className="w-5 h-5 text-gray-600" />
                        <h3 className="text-lg font-semibold text-gray-900">{department}</h3>
                        <span className="bg-gray-200 text-gray-700 text-sm font-medium px-2.5 py-0.5 rounded-full">
                          {deptNotifications.length}
                        </span>
                      </div>
                      {expandedDepartments.has(department) ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                    </button>

                    {/* Department Tasks */}
                    {expandedDepartments.has(department) && (
                      <div className="mt-3 space-y-3">
                        {deptNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <h4 className="text-sm font-medium text-gray-900">
                                    {notification.taskTitle}
                                  </h4>
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getMissingTypeColor(notification.missingType)}`}>
                                    {getMissingTypeIcon(notification.missingType)} {notification.missingType}
                                  </span>
                                </div>
                                
                                <div className="flex items-center space-x-4 text-sm text-gray-600">
                                  <div className="flex items-center space-x-1">
                                    <User className="w-4 h-4" />
                                    <span>{notification.employeeName}</span>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <Briefcase className="w-4 h-4" />
                                    <span>{notification.taskType}</span>
                                  </div>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    notification.priority === 'High' ? 'bg-red-100 text-red-800' :
                                    notification.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-green-100 text-green-800'
                                  }`}>
                                    {notification.priority}
                                  </span>
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
      </div>
    </div>
  );
};

export default CLETNotificationPanel;
