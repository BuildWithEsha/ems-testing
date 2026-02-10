import React, { useState, useEffect } from 'react';
import { Bell, X, AlertTriangle, Calendar, Building, User, Briefcase, CheckCircle, Filter, Search, Download, ChevronDown, ChevronRight } from 'lucide-react';
import MultiSelect from './MultiSelect';
import { useDraggableModal } from '../../hooks/useDraggableModal';

const NotificationPanel = ({ isOpen, onClose, notifications, selectedDate, onDateChange, onRefresh }) => {
  // Filter states
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    assignedTo: [],
    priority: '',
    complexity: '',
    impact: '',
    unit: '',
    target: '',
    labels: '',
    responsible: [],
    accountable: [],
    consulted: [],
    informed: [],
    trained: []
  });

  const [showFilters, setShowFilters] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { modalRef, modalStyle, dragHandleProps } = useDraggableModal();

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
  const groupedNotifications = notifications.reduce((acc, notification) => {
    const dept = notification.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(notification);
    return acc;
  }, {});

  // Apply filters to notifications, including date range
  const filteredNotifications = notifications.filter(notification => {
    // Date range filter (notification.date is YYYY-MM-DD)
    if (fromDate && notification.date && notification.date < fromDate) {
      return false;
    }
    if (toDate && notification.date && notification.date > toDate) {
      return false;
    }
    if (filters.searchTerm && !notification.taskTitle?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && notification.department !== filters.department) {
      return false;
    }
    if (filters.priority && notification.priority !== filters.priority) {
      return false;
    }
    if (filters.labels && !notification.labels?.includes(filters.labels)) {
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

  // Toggle department expansion
  const toggleDepartment = (department) => {
    const newExpanded = new Set(expandedDepartments);
    if (newExpanded.has(department)) {
      newExpanded.delete(department);
    } else {
      newExpanded.add(department);
    }
    setExpandedDepartments(newExpanded);
  };

  // Toggle all departments
  const toggleAllDepartments = () => {
    if (expandedDepartments.size === Object.keys(groupedFilteredNotifications).length) {
      setExpandedDepartments(new Set());
    } else {
      setExpandedDepartments(new Set(Object.keys(groupedFilteredNotifications)));
    }
  };

  // Initialize/sync local date range when opening
  useEffect(() => {
    if (!isOpen) return;
    const base =
      selectedDate ||
      new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
    setFromDate((prev) => prev || base);
    setToDate((prev) => prev || base);
  }, [isOpen, selectedDate]);

  // Fetch employees and departments for filter options
  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const [empRes, deptRes] = await Promise.all([
          fetch('/api/employees'),
          fetch('/api/departments')
        ]);
        
        if (empRes.ok) {
          const empData = await empRes.json();
          const employeesData = Array.isArray(empData.data) ? empData.data : (Array.isArray(empData) ? empData : []);
          setEmployees(employeesData.filter(emp => emp.status === 'Active'));
        }
        
        if (deptRes.ok) {
          const deptData = await deptRes.json();
          setDepartments(Array.isArray(deptData.data) ? deptData.data : (Array.isArray(deptData) ? deptData : []));
        }
      } catch (error) {
        console.error('Error fetching filter data:', error);
      }
    };

    if (isOpen) {
      fetchFilterData();
    }
  }, [isOpen]);

  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      department: '',
      assignedTo: [],
      priority: '',
      complexity: '',
      impact: '',
      unit: '',
      target: '',
      labels: '',
      responsible: [],
      accountable: [],
      consulted: [],
      informed: [],
      trained: []
    });
  };

  const handleSelectTask = (taskId) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredNotifications.map(n => n.id)));
    }
    setSelectAll(!selectAll);
  };

  const getUniqueValues = (field) => {
    const values = notifications.map(n => n[field]).filter(Boolean);
    return [...new Set(values)];
  };

  const exportFilteredNotifications = () => {
    const csvContent = [
      ['Task Title', 'Department', 'Employee', 'Priority', 'Status', 'Task Type', 'Date'],
      ...filteredNotifications.map(n => [
        n.taskTitle || 'N/A',
        n.department || 'N/A',
        n.employeeName || 'N/A',
        n.priority || 'N/A',
        n.status || 'N/A',
        n.taskType || 'N/A',
        n.date || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dwm-incomplete-tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={modalRef} style={modalStyle} className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header - drag to move */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50" {...dragHandleProps}>
          <div className="flex items-center space-x-3">
            <Bell className="w-6 h-6 text-red-500" />
            <h2 className="text-xl font-semibold text-gray-900">
              Incomplete DWM Tasks Notifications
            </h2>
            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {filteredNotifications.length} / {notifications.length}
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

        {/* Date Selection Section */}
        <div className="border-b border-gray-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">
                  Date range:
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <label
                    htmlFor="dwm-from-date"
                    className="text-xs font-medium text-gray-600"
                  >
                    From
                  </label>
                  <input
                    id="dwm-from-date"
                    type="date"
                    value={fromDate || ''}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <span className="text-xs text-gray-500">to</span>
                <div className="flex items-center space-x-1">
                  <label
                    htmlFor="dwm-to-date"
                    className="text-xs font-medium text-gray-600"
                  >
                    To
                  </label>
                  <input
                    id="dwm-to-date"
                    type="date"
                    value={toDate || ''}
                    onChange={(e) => setToDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  const from = fromDate || selectedDate;
                  const to = toDate || from;
                  onRefresh({ from, to });
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Refresh
              </button>
            </div>
            <div className="text-sm text-gray-600">
              {fromDate && toDate ? (
                <span>
                  Showing data for:{' '}
                  <span className="font-medium">
                    {new Date(fromDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}{' '}
                    –{' '}
                    {new Date(toDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </span>
              ) : (
                <span className="text-gray-500">No date selected</span>
              )}
            </div>
          </div>
        </div>

        {/* Filters Section */}
        {showFilters && (
          <div className="border-b border-gray-200 bg-gray-50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear All Filters
              </button>
            </div>
            
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Filter Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {(departments || []).map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
                <MultiSelect
                  options={(employees || []).map(emp => ({
                    value: emp.id,
                    label: `${emp.name} (${emp.employee_id})`
                  }))}
                  value={filters.assignedTo}
                  onChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value }))}
                  placeholder="Select employees..."
                  searchPlaceholder="Search employees..."
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={filters.priority}
                  onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {/* Labels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Labels</label>
                <select
                  value={filters.labels}
                  onChange={(e) => setFilters(prev => ({ ...prev, labels: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {getUniqueValues('labels').map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Active Filters Summary */}
            {Object.values(filters).some(value => 
              Array.isArray(value) ? value.length > 0 : value !== ''
            ) && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-800">
                  <span className="font-medium">Active Filters:</span>
                  {filters.searchTerm && <span className="ml-2 px-2 py-1 bg-blue-200 rounded text-xs">Search: "{filters.searchTerm}"</span>}
                  {filters.department && <span className="ml-2 px-2 py-1 bg-blue-200 rounded text-xs">Dept: {filters.department}</span>}
                  {filters.priority && <span className="ml-2 px-2 py-1 bg-blue-200 rounded text-xs">Priority: {filters.priority}</span>}
                  {filters.labels && <span className="ml-2 px-2 py-1 bg-blue-200 rounded text-xs">Labels: {filters.labels}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-8">
              {notifications.length === 0 ? (
                <>
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">All Good!</h3>
                  <p className="text-gray-500">No incomplete DWM tasks from yesterday.</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Tasks Match Filters</h3>
                  <p className="text-gray-500">
                    {notifications.length} task{notifications.length !== 1 ? 's' : ''} found, but none match your current filters.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Clear All Filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select All Row */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({filteredNotifications.length} tasks)
                </span>
                {selectedTasks.size > 0 && (
                  <span className="text-sm text-blue-600">
                    {selectedTasks.size} selected
                  </span>
                )}
              </div>

              {/* Toggle All Departments */}
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm font-medium text-blue-800">
                  Department View
                </span>
                <button
                  onClick={toggleAllDepartments}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {expandedDepartments.size === Object.keys(groupedFilteredNotifications).length 
                    ? 'Collapse All' 
                    : 'Expand All'
                  }
                </button>
              </div>

              {/* Bulk Actions */}
              {selectedTasks.size > 0 && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm text-blue-800">
                    <span className="font-medium">{selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} selected</span>
                    <span className="ml-2 text-blue-600">
                      ({filteredNotifications.filter(n => selectedTasks.has(n.id)).filter(n => n.priority === 'High').length} High Priority)
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        // TODO: Implement bulk mark as complete
                        alert(`Mark ${selectedTasks.size} tasks as complete`);
                      }}
                      className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                    >
                      Mark Complete
                    </button>
                    <button
                      onClick={() => {
                        // TODO: Implement bulk reassign
                        alert(`Reassign ${selectedTasks.size} tasks`);
                      }}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                    >
                      Reassign
                    </button>
                    <button
                      onClick={() => setSelectedTasks(new Set())}
                      className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition-colors"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}

              {/* Department Groups */}
              {Object.entries(groupedFilteredNotifications).map(([department, deptTasks]) => (
                <div key={department} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Department Header */}
                  <div 
                    className="flex items-center justify-between p-4 bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors"
                    onClick={() => toggleDepartment(department)}
                  >
                    <div className="flex items-center space-x-3">
                      {expandedDepartments.has(department) ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      )}
                      <Building className="w-5 h-5 text-gray-600" />
                      <div>
                        <h3 className="font-medium text-gray-900">{department}</h3>
                        <p className="text-sm text-gray-600">{deptTasks.length} incomplete task{deptTasks.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">
                        {deptTasks.filter(t => t.priority === 'High').length} High Priority
                      </span>
                    </div>
                  </div>

                  {/* Department Tasks */}
                  {expandedDepartments.has(department) && (
                    <div className="border-t border-gray-200">
                      {deptTasks.map((notification, index) => (
                        <div
                          key={notification.id}
                          className="border-b border-gray-100 last:border-b-0 p-4 bg-white hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3">
                              <input
                                type="checkbox"
                                checked={selectedTasks.has(notification.id)}
                                onChange={() => handleSelectTask(notification.id)}
                                className="mt-1 rounded border-gray-300"
                              />
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-3">
                                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                  <div className="flex items-center space-x-2">
                                    <span className="text-sm font-medium text-red-800">
                                      {notification.taskType} Task Not Completed
                                    </span>
                                    <span className="text-xs text-red-600 bg-red-200 px-2 py-1 rounded-full">
                                      {notification.priority || 'Medium'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-red-600 ml-6">
                                    {notification.taskType === 'Daily' && 'Due every day'}
                                    {notification.taskType === 'Weekly' && `Due every ${new Date(notification.date).toLocaleDateString('en-US', { weekday: 'long' })}`}
                                    {notification.taskType === 'Monthly' && `Due on ${new Date(notification.date).getDate()}${getOrdinalSuffix(new Date(notification.date).getDate())} of month`}
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                  <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                      <Calendar className="w-4 h-4 text-gray-500" />
                                      <span className="text-gray-600">Date:</span>
                                      <span className="font-medium text-gray-900">
                                        {new Date(notification.date).toLocaleDateString('en-US', {
                                          weekday: 'long',
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric'
                                        })}
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center space-x-2">
                                      <User className="w-4 h-4 text-gray-500" />
                                      <span className="text-gray-600">Employee:</span>
                                      <span className="font-medium text-gray-900">
                                        {notification.employeeName}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                      <Briefcase className="w-4 h-4 text-gray-500" />
                                      <span className="text-gray-600">Task:</span>
                                    </div>
                                    <div className="ml-6">
                                      <h4 className="font-medium text-gray-900 mb-1">
                                        {notification.taskTitle}
                                      </h4>
                                      {notification.taskDescription && (
                                        <p className="text-gray-600 text-xs line-clamp-2">
                                          {notification.taskDescription}
                                        </p>
                                      )}
                                    </div>
                                  </div>
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
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            <div>
              Showing {filteredNotifications.length} of {notifications.length} incomplete tasks from {selectedDate ? new Date(selectedDate).toLocaleDateString() : (notifications.length > 0 ? new Date(notifications[0]?.date).toLocaleDateString() : 'yesterday')}
            </div>
            {Object.values(filters).some(value => 
              Array.isArray(value) ? value.length > 0 : value !== ''
            ) && (
              <div className="text-xs text-blue-600 mt-1">
                Filters applied: {Object.values(filters).filter(value => 
              Array.isArray(value) ? value.length > 0 : value !== ''
            ).length} active
              </div>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {selectedTasks.size > 0 && (
              <div className="text-xs text-gray-500">
                {selectedTasks.size} High Priority
                {filteredNotifications.filter(n => n.priority === 'Critical').length > 0 && (
                  <span className="ml-2 text-red-600 font-medium">
                    {filteredNotifications.filter(n => n.priority === 'Critical').length} Critical
                  </span>
                )}
              </div>
            )}
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

export default NotificationPanel;
