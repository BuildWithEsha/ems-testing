import React, { useState, useEffect } from 'react';
import { X, Clock, User, Play, Square, Building, Filter, Search, ChevronDown, ChevronRight } from 'lucide-react';

const TimerModal = ({ isOpen, onClose, onStartTimer, onStopTimer, onOpenTask }) => {
  const [activeTab, setActiveTab] = useState('active');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filter states for department-wise filtering
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    designation: '',
    priority: '',
    status: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  // Fetch fresh data when modal opens (only once)
  useEffect(() => {
    if (isOpen) {
      fetchFreshData();
    }
  }, [isOpen]);

  // Update current time every second for active timers (only when viewing active timers tab)
  useEffect(() => {
    if (activeTab === 'active' && tasks.some(task => task.timer_started_at)) {
      const interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activeTab, tasks]);

  // Fetch fresh tasks and employees data from API
  const fetchFreshData = async () => {
    try {
      setLoading(true);
      
      const headers = {
        'Content-Type': 'application/json',
        'user-role': 'Admin',
        'user-permissions': '["all"]',
        'user-name': 'Admin User'
      };
      
      const [tasksResponse, employeesResponse] = await Promise.all([
        fetch('/api/tasks?all=true', { headers }),
        fetch('/api/employees?all=true', { headers })
      ]);

      if (tasksResponse.ok && employeesResponse.ok) {
        const tasksData = await tasksResponse.json();
        const employeesData = await employeesResponse.json();
        
        // Extract data from response - handle different response structures
        let tasks = [];
        let employees = [];
        
        if (Array.isArray(tasksData.data)) {
          tasks = tasksData.data;
        } else if (Array.isArray(tasksData)) {
          tasks = tasksData;
        } else if (tasksData.tasks && Array.isArray(tasksData.tasks)) {
          tasks = tasksData.tasks;
        } else {
          tasks = [];
        }
        
        if (Array.isArray(employeesData.data)) {
          employees = employeesData.data;
        } else if (Array.isArray(employeesData)) {
          employees = employeesData;
        } else if (employeesData.employees && Array.isArray(employeesData.employees)) {
          employees = employeesData.employees;
        } else {
          employees = [];
        }
        
        setTasks(tasks);
        setEmployees(employees);
        setLastRefreshTime(new Date());
      }
    } catch (error) {
      console.error('Timer Management: Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get active timer tasks
  const activeTimerTasks = (tasks || []).filter(task => {
    const hasTimer = task.timer_started_at && 
                     task.timer_started_at !== null && 
                     task.timer_started_at !== '' && 
                     task.timer_started_at !== 'null' &&
                     task.timer_started_at !== 'NULL';
    return hasTimer;
  });
  
  // Get non-active timer employees (all employees who don't have active timers)
  const nonActiveEmployees = (employees || []).filter(employee => {
    const employeeTasks = (tasks || []).filter(task => 
      task.assigned_to && task.assigned_to.includes(employee.name)
    );
    // Return employees who either have no tasks OR have tasks but no active timers
    return !employeeTasks.some(task => task.timer_started_at);
  });

  // Get employees with active timers
  const employeesWithActiveTimers = (employees || []).filter(employee => {
    const employeeTasks = (tasks || []).filter(task => 
      task.assigned_to && task.assigned_to.includes(employee.name)
    );
    return employeeTasks.some(task => task.timer_started_at);
  });

  // Helper: task's assigned employees' designations (from employees list)
  const getTaskDesignations = (task) => {
    if (!task.assigned_to || !(employees || []).length) return [];
    const names = task.assigned_to.split(',').map(n => n.trim()).filter(Boolean);
    return names.map(name => (employees || []).find(emp => emp.name === name)?.designation).filter(Boolean);
  };

  // Apply filters to active timer tasks
  const filteredActiveTimerTasks = activeTimerTasks.filter(task => {
    if (filters.searchTerm && !task.title?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && task.department !== filters.department) {
      return false;
    }
    if (filters.designation) {
      const taskDesignations = getTaskDesignations(task);
      if (!taskDesignations.length || !taskDesignations.includes(filters.designation)) return false;
    }
    if (filters.priority && task.priority !== filters.priority) {
      return false;
    }
    if (filters.status && task.status !== filters.status) {
      return false;
    }
    return true;
  });

  // Apply filters to non-active employees
  const filteredNonActiveEmployees = nonActiveEmployees.filter(employee => {
    if (filters.searchTerm && !employee.name?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && employee.department !== filters.department) {
      return false;
    }
    if (filters.designation && (employee.designation || '') !== filters.designation) {
      return false;
    }
    return true;
  });

  // Apply filters to employees with active timers
  const filteredEmployeesWithActiveTimers = employeesWithActiveTimers.filter(employee => {
    if (filters.searchTerm && !employee.name?.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.department && employee.department !== filters.department) {
      return false;
    }
    if (filters.designation && (employee.designation || '') !== filters.designation) {
      return false;
    }
    return true;
  });

  // Group active timer tasks by department
  const groupedActiveTimerTasks = filteredActiveTimerTasks.reduce((acc, task) => {
    const dept = task.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(task);
    return acc;
  }, {});

  // Group non-active employees by department
  const groupedNonActiveEmployees = filteredNonActiveEmployees.reduce((acc, employee) => {
    const dept = employee.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(employee);
    return acc;
  }, {});

  // Group employees with active timers by department
  const groupedEmployeesWithActiveTimers = filteredEmployeesWithActiveTimers.reduce((acc, employee) => {
    const dept = employee.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(employee);
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
    const currentGroupedData = activeTab === 'active' ? groupedActiveTimerTasks : 
                              activeTab === 'non-active' ? groupedNonActiveEmployees : 
                              groupedEmployeesWithActiveTimers;
    
    if (expandedDepartments.size === Object.keys(currentGroupedData).length) {
      setExpandedDepartments(new Set());
    } else {
      setExpandedDepartments(new Set(Object.keys(currentGroupedData)));
    }
  };

  // Get unique departments for filter dropdown
  const departments = [...new Set([
    ...(tasks || []).map(task => task.department).filter(Boolean),
    ...(employees || []).map(emp => emp.department).filter(Boolean)
  ])].sort();

  // Get unique priorities for filter dropdown
  const priorities = [...new Set((tasks || []).map(task => task.priority).filter(Boolean))].sort();

  // Get unique statuses for filter dropdown
  const statuses = [...new Set((tasks || []).map(task => task.status).filter(Boolean))].sort();

  // Get unique designations for filter dropdown (from employees)
  const designations = [...new Set((employees || []).map(emp => emp.designation).filter(Boolean))].sort();

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '00:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getEmployeePhoto = (employeeName) => {
    const employee = (employees || []).find(emp => emp.name === employeeName);
    return employee?.photo || null;
  };

  const getEmployeeFromTask = (task) => {
    if (!task.assigned_to) return null;
    const assignedNames = task.assigned_to.split(',').map(name => name.trim());
    return (employees || []).find(emp => assignedNames.includes(emp.name));
  };

  const calculateActiveTime = (timerStartedAt) => {
    if (!timerStartedAt) return 0;
    try {
    // Calculate elapsed time directly - server now stores Pakistan time
    const startTime = new Date(timerStartedAt).getTime();
    const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);
      // Clamp to 0 to prevent negative values (timezone mismatch protection)
      return Math.max(0, elapsedSeconds);
    } catch (error) {
      console.error('Error calculating active time:', error, 'timerStartedAt:', timerStartedAt);
      return 0;
    }
  };

  const PAKISTAN_TZ = 'Asia/Karachi';
  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    try {
      // Server stores timer/timesheet in Pakistan time; display in Pakistan timezone
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return '';
      }
      return date.toLocaleDateString('en-US', {
        timeZone: PAKISTAN_TZ,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) + ' ' + date.toLocaleTimeString('en-US', {
        timeZone: PAKISTAN_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.error('Error formatting date:', error, 'dateString:', dateString);
      return '';
    }
  };

  const getCurrentLocalTime = () => {
    // Return current time - server handles Pakistan timezone
    return new Date().toISOString();
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Timer Management</h2>
              {lastRefreshTime && (
                <p className="text-xs text-gray-500">
                  Last updated: {lastRefreshTime.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                console.log('🔍 Manual refresh button clicked');
                fetchFreshData();
              }}
              disabled={loading}
              className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh Timer Data"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'active'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Active Timers ({filteredActiveTimerTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('non-active')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'non-active'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Non-Active Timers ({filteredNonActiveEmployees.length})
          </button>
          <button
            onClick={() => setActiveTab('active-employees')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'active-employees'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Employees with Active Timers ({filteredEmployeesWithActiveTimers.length})
          </button>
        </div>

        {/* Filter Controls */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
                {Object.values(filters).some(f => f) && (
                  <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {Object.values(filters).filter(f => f).length}
                  </span>
                )}
              </button>
              
              <button
                onClick={toggleAllDepartments}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {expandedDepartments.size === Object.keys(
                  activeTab === 'active' ? groupedActiveTimerTasks : 
                  activeTab === 'non-active' ? groupedNonActiveEmployees : 
                  groupedEmployeesWithActiveTimers
                ).length ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                <select
                  value={filters.designation}
                  onChange={(e) => setFilters(prev => ({ ...prev, designation: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Designations</option>
                  {designations.map(des => (
                    <option key={des} value={des}>{des}</option>
                  ))}
                </select>
              </div>
              {activeTab === 'active' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={filters.priority}
                      onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Priorities</option>
                      {priorities.map(priority => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Statuses</option>
                      {statuses.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Timer Data</h3>
              <p className="text-center max-w-md text-gray-500">
                Fetching the latest timer information...
              </p>
            </div>
          ) : activeTab === 'active' ? (
            // Active Timers Tab - Department-wise
            <div>
              {filteredActiveTimerTasks.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No active timers found</p>
                  <p className="text-sm text-gray-400">Click the refresh button above to update data</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedActiveTimerTasks)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([department, deptTasks]) => (
                      <div key={department} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Department Header */}
                        <button
                          onClick={() => toggleDepartment(department)}
                          className="flex items-center justify-between w-full p-4 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Building className="w-5 h-5 text-gray-600" />
                            <h3 className="text-lg font-semibold text-gray-900">{department}</h3>
                            <span className="bg-gray-200 text-gray-700 text-sm font-medium px-2.5 py-0.5 rounded-full">
                              {deptTasks.length}
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
                          <div className="bg-white">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-3">Task</th>
                                    <th className="px-4 py-3">Employee</th>
                                    <th className="px-4 py-3">Start Time</th>
                                    <th className="px-4 py-3">Active Timer</th>
                                    <th className="px-4 py-3">Total Time</th>
                                    <th className="px-4 py-3">Label</th>
                                    <th className="px-4 py-3">Priority</th>
                                    <th className="px-4 py-3">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {deptTasks.map((task) => {
                                    const employee = getEmployeeFromTask(task);
                                    const activeTime = calculateActiveTime(task.timer_started_at);
                                    const totalTime = (task.logged_seconds || 0) + activeTime;
                                    
                                    return (
                                      <tr key={task.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-4 py-4">
                                          <button
                                            className="font-medium text-blue-600 hover:underline max-w-xs truncate text-left"
                                            title="Open task"
                                            onClick={() => onOpenTask && onOpenTask(task)}
                                          >
                                            {task.title}
                                          </button>
                                        </td>
                                        <td className="px-4 py-4">
                                          <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                                              {employee?.photo ? (
                                                <img 
                                                  src={employee.photo} 
                                                  alt={employee.name}
                                                  className="w-full h-full object-cover"
                                                />
                                              ) : (
                                                <User className="w-5 h-5 text-gray-400" />
                                              )}
                                            </div>
                                            <div>
                                              <div className="font-medium text-gray-900">{employee?.name || 'Unknown'}</div>
                                              <div className="text-xs text-gray-500">{task.department}</div>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-4">
                                          <div className="text-gray-900">
                                            {formatDateTime(task.timer_started_at)}
                                          </div>
                                        </td>
                                        <td className="px-4 py-4">
                                          <div className="text-lg font-mono text-green-600">
                                            {formatTime(activeTime)}
                                          </div>
                                        </td>
                                        <td className="px-4 py-4">
                                          <div className="text-lg font-mono text-blue-600">
                                            {formatTime(totalTime)}
                                          </div>
                                        </td>
                                        <td className="px-4 py-4">
                                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {task.labels || 'No Label'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-4">
                                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                            {task.priority || 'Medium'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-4">
                                          <button
                                            onClick={() => onStopTimer(task.id)}
                                            className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                            title="Stop Timer"
                                          >
                                            <Square className="w-4 h-4" />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : activeTab === 'active-employees' ? (
            // Employees with Active Timers Tab - Department-wise
            <div>
              {filteredEmployeesWithActiveTimers.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No employees with active timers found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedEmployeesWithActiveTimers)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([department, deptEmployees]) => (
                      <div key={department} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Department Header */}
                        <button
                          onClick={() => toggleDepartment(department)}
                          className="flex items-center justify-between w-full p-4 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Building className="w-5 h-5 text-gray-600" />
                            <h3 className="text-lg font-semibold text-gray-900">{department}</h3>
                            <span className="bg-gray-200 text-gray-700 text-sm font-medium px-2.5 py-0.5 rounded-full">
                              {deptEmployees.length}
                            </span>
                          </div>
                          {expandedDepartments.has(department) ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                        </button>

                        {/* Department Employees */}
                        {expandedDepartments.has(department) && (
                          <div className="bg-white p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {deptEmployees.map((employee) => {
                                const activeTask = (tasks || []).find(task => 
                                  task.assigned_to && 
                                  task.assigned_to.includes(employee.name) && 
                                  task.timer_started_at
                                );
                                
                                return (
                                  <div key={employee.id} className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                    {/* Employee Photo */}
                                    <div className="w-16 h-16 rounded-full overflow-hidden bg-green-200 flex items-center justify-center mx-auto mb-3">
                                      {employee.photo ? (
                                        <img 
                                          src={employee.photo} 
                                          alt={employee.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <User className="w-8 h-8 text-green-600" />
                                      )}
                                    </div>
                                    
                                    {/* Employee Name */}
                                    <h3 className="font-medium text-gray-900">{employee.name}</h3>
                                    <p className="text-sm text-gray-600">{employee.department}</p>
                                    <p className="text-xs text-green-600 font-medium">Active Timer</p>
                                    {activeTask && (
                                      <p className="text-xs text-gray-500 mt-1 truncate" title={activeTask.title}>
                                        Task: {activeTask.title}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            // Non-Active Timers Tab - Department-wise
            <div>
              {filteredNonActiveEmployees.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">All employees have active timers or no employees found</p>
                  <p className="text-sm text-gray-400 mt-2">Click the refresh button above to update data</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedNonActiveEmployees)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([department, deptEmployees]) => (
                      <div key={department} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Department Header */}
                        <button
                          onClick={() => toggleDepartment(department)}
                          className="flex items-center justify-between w-full p-4 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Building className="w-5 h-5 text-gray-600" />
                            <h3 className="text-lg font-semibold text-gray-900">{department}</h3>
                            <span className="bg-gray-200 text-gray-700 text-sm font-medium px-2.5 py-0.5 rounded-full">
                              {deptEmployees.length}
                            </span>
                          </div>
                          {expandedDepartments.has(department) ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                        </button>

                        {/* Department Employees */}
                        {expandedDepartments.has(department) && (
                          <div className="bg-white p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {deptEmployees.map((employee) => {
                                const employeeTasks = (tasks || []).filter(task => 
                                  task.assigned_to && task.assigned_to.includes(employee.name)
                                );
                                const totalTasks = employeeTasks.length;
                                const completedTasks = employeeTasks.filter(task => task.status === 'Completed').length;
                                const pendingTasks = employeeTasks.filter(task => task.status === 'Pending').length;
                                
                                return (
                                  <div key={employee.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                                    {/* Employee Photo */}
                                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center mx-auto mb-3">
                                      {employee.photo ? (
                                        <img 
                                          src={employee.photo} 
                                          alt={employee.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <User className="w-8 h-8 text-gray-400" />
                                      )}
                                    </div>
                                    
                                    {/* Employee Name */}
                                    <h3 className="font-medium text-gray-900">{employee.name}</h3>
                                    <p className="text-sm text-gray-600">{employee.department || 'No Department'}</p>
                                    <p className="text-xs text-red-600 font-medium">No Active Timer</p>
                                    
                                    {/* Task Summary */}
                                    <div className="mt-2 text-xs text-gray-500">
                                      {totalTasks > 0 ? (
                                        <>
                                          <p>{totalTasks} total task{totalTasks !== 1 ? 's' : ''}</p>
                                          <p>{pendingTasks} pending • {completedTasks} completed</p>
                                        </>
                                      ) : (
                                        <p>No tasks assigned</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimerModal; 