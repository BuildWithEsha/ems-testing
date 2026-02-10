import React, { useState, useEffect } from 'react';
import { 
  BarChart2, 
  Clock, 
  Calendar,
  Filter,
  Download,
  Search,
  CheckCircle,
  AlertTriangle,
  Briefcase,
  TrendingUp,
  Calendar as CalendarIcon
} from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { useAuth } from '../../contexts/AuthContext';

const Reports = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('task');

  // Manager by designation: can access Reports but only Consolidated Time Log (no other reports)
  const isManagerByDesignation = () => {
    if (!user || !user.designation) return false;
    return String(user.designation).trim().toLowerCase() === 'manager';
  };
  const hasFullReportsAccess = () => {
    if (!user) return false;
    if (user.role && String(user.role).toLowerCase() === 'admin') return true;
    if (user.user_role && String(user.user_role).toLowerCase() === 'admin') return true;
    if (Array.isArray(user.permissions) && (user.permissions.includes('all') || user.permissions.includes('view_reports_menu'))) return true;
    return false;
  };
  const isManagerOnlyView = isManagerByDesignation() && !hasFullReportsAccess();
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states for Task Report
  const [taskReportFilters, setTaskReportFilters] = useState({
    startDate: '',
    endDate: '',
    department: '',
    assignedTo: '',
    status: '',
    priority: '',
    label: '',
    dueDateFrom: '',
    dueDateTo: ''
  });

  // Filter states for DWM Report
  const [dwmReportFilters, setDwmReportFilters] = useState({
    department: '',
    employee: '',
    startDate: '2025-08-01',
    endDate: '2025-08-05'
  });

  // Filter modal state
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Build tasks URL with optional department/employee filters for Reports
      let tasksUrl = '/api/tasks';
      const reportParams = new URLSearchParams();
      reportParams.set('all', 'true'); // Get all tasks for reports
      if (user) {
        reportParams.set('user_id', user.id);
        reportParams.set('role', user.role);
        reportParams.set('employee_name', user.name || '');
      }
      if (dwmReportFilters.department) reportParams.set('department', dwmReportFilters.department);
      if (dwmReportFilters.employee) reportParams.set('employee', dwmReportFilters.employee);
      const queryStr = reportParams.toString();
      if (queryStr) tasksUrl += `?${queryStr}`;
      
      // Prepare headers with user permissions for the tasks request
      const tasksHeaders = {};
      if (user) {
        tasksHeaders['user-role'] = user.role || 'employee';
        tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
        tasksHeaders['user-name'] = user.name || '';
        
        // Debug logging
        console.log('🔍 Reports Debug - User Info:', {
          userRole: user.role,
          userName: user.name,
          userPermissions: user.permissions,
          employeeName: user.name || ''
        });
        console.log('🔍 Reports Debug - Request Headers:', tasksHeaders);
        console.log('🔍 Reports Debug - Request URL:', tasksUrl);
      }
      
      const [tasksResponse, employeesResponse] = await Promise.all([
        fetch(tasksUrl, { headers: tasksHeaders }),
        fetch('/api/employees')
      ]);

      if (tasksResponse.ok && employeesResponse.ok) {
        const tasksData = await tasksResponse.json();
        const employeesData = await employeesResponse.json();
        
        // Debug logging
        console.log('🔍 Reports Debug - Tasks Data:', tasksData);
        console.log('🔍 Reports Debug - Tasks Count:', tasksData.length);
        
        setTasks(Array.isArray(tasksData.data) ? tasksData.data : (Array.isArray(tasksData) ? tasksData : []));
        setEmployees(Array.isArray(employeesData.data) ? employeesData.data : (Array.isArray(employeesData) ? employeesData : []));
      } else {
        console.error('🔍 Reports Debug - API Error:', {
          tasksStatus: tasksResponse.status,
          employeesStatus: employeesResponse.status
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dwmReportFilters.department, dwmReportFilters.employee]);

  // Calculate task statistics
  const calculateTaskStats = () => {
    const filteredTasks = filterTasks(tasks, taskReportFilters);
    return {
      total: filteredTasks.length,
      completed: filteredTasks.filter(task => task.status === 'Completed').length,
      inProgress: filteredTasks.filter(task => task.status === 'In Progress').length,
      overdue: filteredTasks.filter(task => {
        if (!task.due_date) return false;
        return new Date(task.due_date) < new Date() && task.status !== 'Completed';
      }).length
    };
  };

  // Filter tasks based on filters
  const filterTasks = (taskList, filters) => {
    return taskList.filter(task => {
      if (filters.startDate && task.created_at) {
        const taskDate = new Date(task.created_at);
        const startDate = new Date(filters.startDate);
        if (taskDate < startDate) return false;
      }
      if (filters.endDate && task.created_at) {
        const taskDate = new Date(task.created_at);
        const endDate = new Date(filters.endDate);
        if (taskDate > endDate) return false;
      }
      if (filters.department && task.department !== filters.department) return false;
      if (filters.assignedTo && task.assigned_to !== filters.assignedTo) return false;
      if (filters.status && task.status !== filters.status) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.label && !task.labels?.toLowerCase().includes(filters.label.toLowerCase())) return false;
      if (filters.dueDateFrom && task.due_date) {
        const taskDueDate = new Date(task.due_date);
        const fromDate = new Date(filters.dueDateFrom);
        if (taskDueDate < fromDate) return false;
      }
      if (filters.dueDateTo && task.due_date) {
        const taskDueDate = new Date(task.due_date);
        const toDate = new Date(filters.dueDateTo);
        if (taskDueDate > toDate) return false;
      }
      return true;
    });
  };

  // DWM Report Logic (server-driven using history to count completions per day)
  const calculateDWMStats = () => {
    const { startDate, endDate, department, employee } = dwmReportFilters;
    if (!startDate || !endDate) return [];

    // Build a date list for the range
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

    const dayList = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dayList.push(new Date(d));
    }

    // Fetch aggregated completions from server
    const params = new URLSearchParams({ startDate, endDate });
    if (department) params.append('department', department);
    if (employee) params.append('employee', employee);

    // Note: This is synchronous within render; in production, move to useEffect + state
    // For now, compute from cached fetch below
    return dwmAggregatesToRows(dayList, dwmAggregates, tasks, dwmReportFilters);
  };

  // Hold server aggregates
  const [dwmAggregates, setDwmAggregates] = useState([]);

  useEffect(() => {
    const loadAggregates = async () => {
      try {
        const { startDate, endDate, department, employee } = dwmReportFilters;
        if (!startDate || !endDate) { setDwmAggregates([]); return; }
        const params = new URLSearchParams({ startDate, endDate });
        if (department) params.append('department', department);
        if (employee) params.append('employee', employee);
        const res = await fetch(`/api/reports/dwm?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setDwmAggregates(data);
        } else {
          setDwmAggregates([]);
        }
      } catch (e) {
        console.error('Failed to load DWM aggregates', e);
        setDwmAggregates([]);
      }
    };
    loadAggregates();
  }, [dwmReportFilters.startDate, dwmReportFilters.endDate, dwmReportFilters.department, dwmReportFilters.employee]);

  function dwmAggregatesToRows(dayList, aggregates, allTasks, filters) {
    // Use backend's total counts instead of calculating locally
    return dayList.map(day => {
      const dayIso = new Date(day.getTime() - day.getTimezoneOffset()*60000).toISOString().slice(0,10);
      const pretty = day.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

      // Find the backend data for this day
      const row = aggregates.find(a => a.day === dayIso) || { 
        daily_completed: 0, daily_total: 0,
        weekly_completed: 0, weekly_total: 0,
        monthly_completed: 0, monthly_total: 0
      };

      return {
        date: pretty,
        daily: `${row.daily_completed}/${row.daily_total}`,
        weekly: row.weekly_total > 0 ? `${row.weekly_completed}/${row.weekly_total}` : 'N/A',
        monthly: row.monthly_total > 0 ? `${row.monthly_completed}/${row.monthly_total}` : 'N/A'
      };
    });
  }

  const taskStats = calculateTaskStats();
  const dwmStats = calculateDWMStats();

  // Managers (by designation, without full reports permission) see only Consolidated Time Log; others see all tabs
  const allTabs = [
    { id: 'task', label: 'Task Report', icon: BarChart2 },
    { id: 'timelog', label: 'Time Log Report', icon: Clock },
    { id: 'consolidated_timelog', label: 'Consolidated Time Log Report', icon: Clock },
    { id: 'dwm', label: 'DWM Report', icon: Calendar }
  ];
  const tabs = isManagerOnlyView
    ? [{ id: 'consolidated_timelog', label: 'Consolidated Time Log Report', icon: Clock }]
    : allTabs;

  // When manager-only, force active tab to consolidated
  React.useEffect(() => {
    if (isManagerOnlyView && activeTab !== 'consolidated_timelog') {
      setActiveTab('consolidated_timelog');
    }
  }, [isManagerOnlyView, activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        {!isManagerOnlyView && (
          <div className="flex space-x-3">
            <Button variant="outline" className="flex items-center space-x-2 relative" onClick={() => setShowFilterModal(true)}>
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {Object.values(taskReportFilters).some(value => value !== '' && value !== undefined) && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {Object.values(taskReportFilters).filter(value => value !== '' && value !== undefined).length}
                </span>
              )}
            </Button>
            <Button variant="outline" className="flex items-center space-x-2">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </Button>
          </div>
        )}
      </div>

      {/* Tab Navigation - single tab for manager-only, all tabs otherwise */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm
                  ${isActive
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'task' && (
          <TaskReport 
            stats={taskStats}
            tasks={filterTasks(tasks, taskReportFilters)}
            filters={taskReportFilters}
            setFilters={setTaskReportFilters}
            employees={employees}
          />
        )}

        {activeTab === 'timelog' && (
          <TimeLogReport />
        )}

        {activeTab === 'consolidated_timelog' && (
          <ConsolidatedTimeLogReport />
        )}

        {activeTab === 'dwm' && (
          <DWMReport 
            stats={dwmStats}
            filters={dwmReportFilters}
            setFilters={setDwmReportFilters}
            employees={employees}
          />
        )}
      </div>

      {/* Filter Modal */}
      <Modal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        title="Filters"
      >
        <div className="space-y-4">
          {/* Department Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
            <select
              value={taskReportFilters.department}
              onChange={(e) => setTaskReportFilters(prev => ({ ...prev, department: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select...</option>
              {Array.from(new Set((employees || []).map(emp => emp.department))).map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Assigned To Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
            <select
              value={taskReportFilters.assignedTo}
              onChange={(e) => setTaskReportFilters(prev => ({ ...prev, assignedTo: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select employees...</option>
              {(employees || []).map(emp => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
            <select
              value={taskReportFilters.priority || ''}
              onChange={(e) => setTaskReportFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select...</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Label Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
            <select
              value={taskReportFilters.label || ''}
              onChange={(e) => setTaskReportFilters(prev => ({ ...prev, label: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select...</option>
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={taskReportFilters.status}
              onChange={(e) => setTaskReportFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select...</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Due">Due</option>
            </select>
          </div>

          {/* Due Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Due Date From</label>
              <input
                type="date"
                value={taskReportFilters.dueDateFrom || ''}
                onChange={(e) => setTaskReportFilters(prev => ({ ...prev, dueDateFrom: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Due Date To</label>
              <input
                type="date"
                value={taskReportFilters.dueDateTo || ''}
                onChange={(e) => setTaskReportFilters(prev => ({ ...prev, dueDateTo: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          <div className="flex justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setTaskReportFilters({
                  startDate: '',
                  endDate: '',
                  department: '',
                  assignedTo: '',
                  status: '',
                  priority: '',
                  label: '',
                  dueDateFrom: '',
                  dueDateTo: ''
                });
                setShowFilterModal(false);
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Task Report Component
const TaskReport = ({ stats, tasks, filters, setFilters, employees }) => {
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const statCards = [
    {
      title: 'Total Tasks',
      value: stats.total,
      icon: Briefcase,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50'
    },
    {
      title: 'Tasks Completed',
      value: stats.completed,
      icon: CheckCircle,
      color: 'bg-green-500',
      bgColor: 'bg-green-50'
    },
    {
      title: 'Tasks In Progress',
      value: stats.inProgress,
      icon: Clock,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Overdue Tasks',
      value: stats.overdue,
      icon: AlertTriangle,
      color: 'bg-red-500',
      bgColor: 'bg-red-50'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Date Range */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Date Range</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <div className="relative">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <div className="relative">
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className={`${stat.bgColor} rounded-lg shadow p-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Task List</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                <th className="px-6 py-3">Task</th>
                <th className="px-6 py-3">Assigned To</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                    No tasks found
                  </td>
                </tr>
              ) : (
                (tasks || []).map((task) => (
                  <tr key={task.id} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {task.title}
                    </td>
                    <td className="px-6 py-4">{task.assigned_to || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        task.status === 'Completed' ? 'bg-green-100 text-green-800' :
                        task.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {task.status || 'To Do'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Time Log Report Component
const TimeLogReport = () => {
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    employee: '',
    department: '',
    taskTitle: ''
  });
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    const init = async () => {
      const [empRes, deptRes] = await Promise.all([
        fetch('/api/employees?all=true'),
        fetch('/api/departments')
      ]);
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(Array.isArray(empData.data) ? empData.data : (Array.isArray(empData) ? empData : []));
      }
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(Array.isArray(deptData.data) ? deptData.data : (Array.isArray(deptData) ? deptData : []));
      }
    };
    init();
    // default last 7 days
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    setFilters(f => ({ ...f, startDate: toISO(start), endDate: toISO(end) }));
  }, []);

  const formatHMS = (s) => {
    // Ensure s is a proper number, not scientific notation
    const seconds = parseInt(s, 10) || 0;
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds%3600)/60), sec = seconds%60;
    return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const fetchReport = async () => {
    if (!filters.startDate || !filters.endDate) return;
    const params = new URLSearchParams({ start: filters.startDate, end: filters.endDate });
    if (filters.employee) params.append('employee', filters.employee);
    if (filters.department) params.append('department', filters.department);
    if (filters.taskTitle) params.append('taskTitle', filters.taskTitle);
    const res = await fetch(`/api/reports/timelog?${params.toString()}`);
    const data = res.ok ? await res.json() : { items: [], totalSeconds: 0 };
    setRows(data.items || []);
    setTotalSeconds(data.totalSeconds || 0);
  };

  useEffect(() => { fetchReport(); }, [filters.startDate, filters.endDate, filters.employee, filters.department]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Time Log Report</h3>
          <div className="text-sm text-gray-600">Total: <span className="font-bold text-indigo-700">{formatHMS(totalSeconds)}</span></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input type="date" value={filters.startDate} onChange={(e)=>setFilters(f=>({...f, startDate: e.target.value}))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input type="date" value={filters.endDate} onChange={(e)=>setFilters(f=>({...f, endDate: e.target.value}))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
            <select value={filters.employee} onChange={(e)=>setFilters(f=>({...f, employee: e.target.value}))} className="w-full border rounded px-3 py-2">
              <option value="">All</option>
              {(employees || []).map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
            <select value={filters.department} onChange={(e)=>setFilters(f=>({...f, department: e.target.value}))} className="w-full border rounded px-3 py-2">
              <option value="">All</option>
              {(departments || []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search by Task Name
            </label>
            <input
              type="text"
              value={filters.taskTitle}
              onChange={(e) =>
                setFilters((f) => ({ ...f, taskTitle: e.target.value }))
              }
              className="w-full border rounded px-3 py-2"
              placeholder="Type task name..."
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 text-left">Employee</th>
              <th className="px-6 py-3 text-left">Task Name</th>
              <th className="px-6 py-3 text-left">Date</th>
              <th className="px-6 py-3 text-left">Label</th>
              <th className="px-6 py-3 text-left">Priority</th>
              <th className="px-6 py-3 text-right">Total Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-b">
                <td className="px-6 py-3">{r.employee_name}</td>
                <td className="px-6 py-3">{r.task_title}</td>
                <td className="px-6 py-3">{new Date(r.log_date).toLocaleDateString()}</td>
                <td className="px-6 py-3">{r.labels || '-'}</td>
                <td className="px-6 py-3">{r.priority || '-'}</td>
                <td className="px-6 py-3 text-right font-mono text-indigo-700">{formatHMS(r.seconds)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Consolidated Time Log Report Component
const ConsolidatedTimeLogReport = () => {
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    employee: '',
    department: '',
    taskTitle: ''
  });
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    const init = async () => {
      const [empRes, deptRes] = await Promise.all([
        fetch('/api/employees?all=true'),
        fetch('/api/departments')
      ]);
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(Array.isArray(empData.data) ? empData.data : (Array.isArray(empData) ? empData : []));
      }
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(Array.isArray(deptData.data) ? deptData.data : (Array.isArray(deptData) ? deptData : []));
      }
    };
    init();
    // default last 7 days
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    setFilters(f => ({ ...f, startDate: toISO(start), endDate: toISO(end) }));
  }, []);

  const formatHMS = (s) => {
    const seconds = parseInt(s, 10) || 0;
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds%3600)/60), sec = seconds%60;
    return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const formatEstimate = (hours, minutes) => {
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    if (h === 0 && m === 0) return '-';
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    return parts.join(' ') || '-';
  };

  const fetchReport = async () => {
    if (!filters.startDate || !filters.endDate) return;
    const params = new URLSearchParams({ start: filters.startDate, end: filters.endDate });
    if (filters.employee) params.append('employee', filters.employee);
    if (filters.department) params.append('department', filters.department);
    if (filters.taskTitle) params.append('taskTitle', filters.taskTitle);
    const res = await fetch(`/api/reports/timelog/consolidated?${params.toString()}`);
    const data = res.ok ? await res.json() : { items: [], totalSeconds: 0 };
    setRows(data.items || []);
    setTotalSeconds(data.totalSeconds || 0);
  };

  useEffect(() => { fetchReport(); }, [filters.startDate, filters.endDate, filters.employee, filters.department]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Consolidated Time Log Report</h3>
          <div className="text-sm text-gray-600">Total: <span className="font-bold text-indigo-700">{formatHMS(totalSeconds)}</span></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input type="date" value={filters.startDate} onChange={(e)=>setFilters(f=>({...f, startDate: e.target.value}))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input type="date" value={filters.endDate} onChange={(e)=>setFilters(f=>({...f, endDate: e.target.value}))} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
            <select value={filters.employee} onChange={(e)=>setFilters(f=>({...f, employee: e.target.value}))} className="w-full border rounded px-3 py-2">
              <option value="">All</option>
              {(employees || []).map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
            <select value={filters.department} onChange={(e)=>setFilters(f=>({...f, department: e.target.value}))} className="w-full border rounded px-3 py-2">
              <option value="">All</option>
              {(departments || []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 text-left">Employee</th>
              <th className="px-6 py-3 text-left">Task Name</th>
              <th className="px-6 py-3 text-left">Label</th>
              <th className="px-6 py-3 text-left">Priority</th>
              <th className="px-6 py-3 text-right">Estimate Time</th>
              <th className="px-6 py-3 text-right">Total Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-b">
                <td className="px-6 py-3">{r.employee_name}</td>
                <td className="px-6 py-3">{r.task_title}</td>
                <td className="px-6 py-3">{r.labels || '-'}</td>
                <td className="px-6 py-3">{r.priority || '-'}</td>
                <td className="px-6 py-3 text-right font-mono text-gray-600">{formatEstimate(r.time_estimate_hours, r.time_estimate_minutes)}</td>
                <td className="px-6 py-3 text-right font-mono text-indigo-700">{formatHMS(r.seconds)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// DWM Report Component
const DWMReport = ({ stats, filters, setFilters, employees }) => {
  const [departments, setDepartments] = useState([]);
  const [detailModal, setDetailModal] = useState({ open: false, date: '', category: '', completed: true, items: [], totalSeconds: 0 });

  // Fetch departments
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await fetch('/api/departments');
        if (response.ok) {
          const departmentsData = await response.json();
          setDepartments(Array.isArray(departmentsData.data) ? departmentsData.data : (Array.isArray(departmentsData) ? departmentsData : []));
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    };
    fetchDepartments();
  }, []);

  // Handle escape key for modal
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && detailModal.open) {
        setDetailModal(prev => ({ ...prev, open: false }));
      }
    };

    if (detailModal.open) {
      document.addEventListener('keydown', handleEscapeKey);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [detailModal.open]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const openDetail = async (dateLabel, category, completed) => {
    try {
      // Convert pretty date label back to YYYY-MM-DD
      // stats rows were built from dayList; rebuild using filters' start/end to map label
      const dateObj = new Date(dateLabel);
      // If dateLabel is not parseable (because it's long format), attempt to reconstruct with toLocaleDateString comparison
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      let iso = '';
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const pretty = new Date(d).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
        if (pretty === dateLabel) {
          const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
          iso = local.toISOString().slice(0,10);
          break;
        }
      }
      if (!iso) {
        const local = new Date(dateObj.getTime() - dateObj.getTimezoneOffset()*60000);
        iso = local.toISOString().slice(0,10);
      }
      const params = new URLSearchParams({ date: iso, category, completed: String(completed) });
      if (filters.department) params.append('department', filters.department);
      if (filters.employee) params.append('employee', filters.employee);
      const res = await fetch(`/api/reports/dwm/details?${params.toString()}`);
      const data = res.ok ? await res.json() : { items: [], totalSeconds: 0 };
      setDetailModal({ open: true, date: dateLabel, category, completed, items: data.items || [], totalSeconds: data.totalSeconds || 0 });
    } catch (e) {
      console.error('Failed to open detail modal', e);
      setDetailModal({ open: true, date: dateLabel, category, completed, items: [], totalSeconds: 0 });
    }
  };

  const formatHms = (totalSeconds) => {
    const s = Math.max(0, parseInt(totalSeconds || 0, 10));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => n.toString().padStart(2, '0');
    return `${h}:${pad(m)}:${pad(sec)}`;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
            <select
              value={filters.department}
              onChange={(e) => handleFilterChange('department', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select...</option>
              {(departments || []).map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
            <select
              value={filters.employee}
              onChange={(e) => handleFilterChange('employee', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Select...</option>
              {(employees || []).filter(emp => emp.status === 'Active').map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name} ({emp.employee_id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <div className="relative">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <div className="relative">
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* DWM Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">Date</th>
                <th className="px-6 py-3 text-right">Daily</th>
                <th className="px-6 py-3 text-right">Weekly</th>
                <th className="px-6 py-3 text-right">Monthly</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat, index) => (
                <tr key={index} className={`bg-white border-b ${index % 2 === 0 ? 'bg-gray-50' : ''}`}>
                  <td className="px-6 py-4 font-medium text-gray-900">{stat.date}</td>
                  <td className="px-6 py-4 text-right">
                    {/* clickable completed/total */}
                    <button className="text-indigo-600 hover:underline mr-1" onClick={() => openDetail(stat.date, 'daily', true)} title="View completed tasks">
                      {String(stat.daily).split('/')[0]}
                    </button>
                    /
                    <button className="text-gray-600 hover:underline ml-1" onClick={() => openDetail(stat.date, 'daily', false)} title="View not completed tasks">
                      {String(stat.daily).split('/')[1]}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {stat.weekly === 'N/A' ? 'N/A' : (
                      <>
                        <button className="text-indigo-600 hover:underline mr-1" onClick={() => openDetail(stat.date, 'weekly', true)}>
                          {String(stat.weekly).split('/')[0]}
                        </button>
                        /
                        <button className="text-gray-600 hover:underline ml-1" onClick={() => openDetail(stat.date, 'weekly', false)}>
                          {String(stat.weekly).split('/')[1]}
                        </button>
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {stat.monthly === 'N/A' ? 'N/A' : (
                      <>
                        <button className="text-indigo-600 hover:underline mr-1" onClick={() => openDetail(stat.date, 'monthly', true)}>
                          {String(stat.monthly).split('/')[0]}
                        </button>
                        /
                        <button className="text-gray-600 hover:underline ml-1" onClick={() => openDetail(stat.date, 'monthly', false)}>
                          {String(stat.monthly).split('/')[1]}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detailModal.open && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDetailModal(prev => ({ ...prev, open: false }));
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                {detailModal.completed ? 'Completed' : 'Not Completed'} {detailModal.category.toUpperCase()} tasks on {detailModal.date}
              </h3>
              <button 
                className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-1 rounded-full hover:bg-gray-100"
                onClick={() => setDetailModal(prev => ({ ...prev, open: false }))}
                aria-label="Close modal"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-hidden">
              {detailModal.items.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-gray-600">No tasks found.</p>
                </div>
              ) : (
                <div className="h-full overflow-y-auto">
                  <div className="p-6">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Task Name</th>
                            <th className="px-4 py-3 text-left font-medium">Label</th>
                            <th className="px-4 py-3 text-left font-medium">Priority</th>
                            <th className="px-4 py-3 text-right font-medium">Time Spent</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {detailModal.items.map((item, index) => (
                            <tr key={item.id || index} className="hover:bg-gray-50 transition-colors duration-150">
                              <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate" title={item.title}>
                                {item.title}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {item.labels || '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  item.priority === 'High' ? 'bg-red-100 text-red-800' :
                                  item.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                  item.priority === 'Low' ? 'bg-green-100 text-green-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {item.priority || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-indigo-700 font-medium">
                                {formatHms(item.seconds)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{detailModal.items.length}</span> task{detailModal.items.length !== 1 ? 's' : ''} found
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Total Time:</div>
                <div className="font-semibold text-gray-900 text-lg">{formatHms(detailModal.totalSeconds)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports; 