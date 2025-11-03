import React, { useEffect, useState } from 'react';
import { Users, UserCheck, UserCog, User, DollarSign, Clock, Calendar, CheckCircle, AlertCircle, TrendingUp, BarChart3, Target } from 'lucide-react';
import Modal from '../ui/Modal';

export default function DepartmentDashboard({ department, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModal, setSelectedModal] = useState(null);
  const [modalData, setModalData] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      console.log('🔍 DepartmentDashboard Debug - Fetching stats for department:', department);
      console.log('🔍 DepartmentDashboard Debug - Department ID:', department.id);
      console.log('🔍 DepartmentDashboard Debug - Department name:', department.name);
      
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch(`/api/departments/${department.id}/dashboard`);
        console.log('🔍 DepartmentDashboard Debug - API Response status:', res.status);
        
        if (res.ok) {
          const data = await res.json();
          console.log('🔍 DepartmentDashboard Debug - API Response data:', data);
          setStats(data);
        } else {
          console.error('🔍 DepartmentDashboard Debug - API Error:', res.status, res.statusText);
          const errorText = await res.text();
          console.error('🔍 DepartmentDashboard Debug - Error response:', errorText);
          setError(`API Error: ${res.status} ${res.statusText}`);
        }
      } catch (error) {
        console.error('🔍 DepartmentDashboard Debug - Fetch error:', error);
        setError(`Network Error: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [department.id]);

  // Function to handle card clicks
  const handleCardClick = async (cardType, filters = {}) => {
    try {
      let endpoint = '';
      let title = '';
      
      console.log('🔍 DepartmentDashboard Debug - Card clicked:', cardType);
      console.log('🔍 DepartmentDashboard Debug - Department:', department);
      console.log('🔍 DepartmentDashboard Debug - Department name:', department.name);
      
      switch (cardType) {
        case 'totalEmployees':
          endpoint = `/api/employees?department=${encodeURIComponent(department.name)}`;
          title = `${department.name} - All Employees`;
          break;
        case 'totalCost':
          endpoint = `/api/employees?department=${encodeURIComponent(department.name)}`;
          title = `${department.name} - Cost Breakdown`;
          break;
        case 'assignedHours':
          endpoint = `/api/employees?department=${encodeURIComponent(department.name)}`;
          title = `${department.name} - Hours Distribution`;
          break;
        case 'completedTasks':
          endpoint = `/api/tasks?department=${encodeURIComponent(department.name)}&status=Completed`;
          title = `${department.name} - Completed Tasks`;
          break;
        case 'managers':
          endpoint = `/api/employees?department=${encodeURIComponent(department.name)}&designation=manager`;
          title = `${department.name} - Managers`;
          break;
        case 'teamLeaders':
          endpoint = `/api/employees?department=${encodeURIComponent(department.name)}&designation=team leader`;
          title = `${department.name} - Team Leaders`;
          break;
        case 'operators':
          endpoint = `/api/employees?department=${encodeURIComponent(department.name)}&designation=operator`;
          title = `${department.name} - Operators`;
          break;
        case 'dailyTasks':
          endpoint = `/api/tasks?department=${encodeURIComponent(department.name)}&labels=daily task`;
          title = `${department.name} - Daily Tasks`;
          break;
        case 'weeklyTasks':
          endpoint = `/api/tasks?department=${encodeURIComponent(department.name)}&labels=weekly task`;
          title = `${department.name} - Weekly Tasks`;
          break;
        case 'monthlyTasks':
          endpoint = `/api/tasks?department=${encodeURIComponent(department.name)}&labels=monthly task`;
          title = `${department.name} - Monthly Tasks`;
          break;
        case 'pendingTasks':
          endpoint = `/api/tasks?department=${encodeURIComponent(department.name)}&status=Pending`;
          title = `${department.name} - Pending Tasks`;
          break;
        case 'completionRate':
          endpoint = `/api/tasks?department=${encodeURIComponent(department.name)}`;
          title = `${department.name} - Task Completion Analytics`;
          break;
        default:
          return;
      }

      console.log('🔍 DepartmentDashboard Debug - Endpoint:', endpoint);
      console.log('🔍 DepartmentDashboard Debug - Full URL:', `${endpoint}`);

      const response = await fetch(`${endpoint}`);
      console.log('🔍 DepartmentDashboard Debug - Response status:', response.status);
      console.log('🔍 DepartmentDashboard Debug - Response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 DepartmentDashboard Debug - Response data:', data);
        console.log('🔍 DepartmentDashboard Debug - Data type:', typeof data);
        console.log('🔍 DepartmentDashboard Debug - Is array:', Array.isArray(data));
        if (Array.isArray(data)) {
          console.log('🔍 DepartmentDashboard Debug - Data length:', data.length);
        } else if (data && typeof data === 'object') {
          console.log('🔍 DepartmentDashboard Debug - Data keys:', Object.keys(data));
        }
        
        setModalData({ type: cardType, data, filters });
        setSelectedModal(cardType);
      } else {
        console.error('🔍 DepartmentDashboard Debug - Response not ok:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('🔍 DepartmentDashboard Debug - Error response:', errorText);
      }
    } catch (error) {
      console.error('🔍 DepartmentDashboard Debug - Fetch error:', error);
    }
  };

  // Function to close modal
  const closeModal = () => {
    setSelectedModal(null);
    setModalData(null);
  };

  // Function to handle task click
  const handleTaskClick = (task) => {
    setSelectedTask(task);
  };

  // Function to handle employee click
  const handleEmployeeClick = (employee) => {
    setSelectedEmployee(employee);
  };

  // Function to close task view
  const closeTaskView = () => {
    setSelectedTask(null);
  };

  // Function to close employee view
  const closeEmployeeView = () => {
    setSelectedEmployee(null);
  };

  // Function to render modal content based on card type
  const renderModalContent = () => {
    if (!modalData) return null;

    const { type, data } = modalData;

    switch (type) {
      case 'totalEmployees':
      case 'managers':
      case 'teamLeaders':
      case 'operators':
        return <EmployeeListView data={data} type={type} onEmployeeClick={handleEmployeeClick} />;
      
      case 'totalCost':
        return <CostBreakdownView data={data} department={department} />;
      
      case 'assignedHours':
        return <HoursDistributionView data={data} department={department} />;
      
      case 'dailyTasks':
      case 'weeklyTasks':
      case 'monthlyTasks':
      case 'completedTasks':
      case 'pendingTasks':
        return <TaskListView data={data} type={type} onTaskClick={handleTaskClick} />;
      
      case 'completionRate':
        return <CompletionAnalyticsView data={data} department={department} />;
      
      default:
        return <div>No data available</div>;
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 text-lg">Loading department statistics...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="text-lg font-semibold">Error Loading Department Data</p>
          <p className="text-sm">{error}</p>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
        >
          Retry
        </button>
      </div>
    </div>
  );

  if (!stats) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600 text-lg">No data available for this department.</p>
      </div>
    </div>
  );

  // Helper function to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Helper function to format hours
  const formatHours = (hours) => {
    return `${hours.toLocaleString()} hrs`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{department.name}</h1>
                <p className="text-lg text-gray-600">Department Dashboard</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:shadow-md"
            >
              Close Dashboard
            </button>
          </div>
          
          {/* Summary Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div 
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
              onClick={() => handleCardClick('totalEmployees')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total Employees</p>
                  <p className="text-3xl font-bold">{stats.totalEmployees}</p>
                </div>
                <Users className="w-8 h-8 text-blue-200" />
              </div>
            </div>
            
            <div 
              className="bg-gradient-to-r from-green-500 to-green-600 text-white p-6 rounded-xl cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
              onClick={() => handleCardClick('totalCost')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Total Cost</p>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalCost)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-200" />
              </div>
            </div>
            
            <div 
              className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6 rounded-xl cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
              onClick={() => handleCardClick('assignedHours')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Assigned Hours</p>
                  <p className="text-2xl font-bold">{formatHours(stats.assignedHours)}</p>
                </div>
                <Clock className="w-8 h-8 text-purple-200" />
              </div>
            </div>
            
            <div 
              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6 rounded-xl cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
              onClick={() => handleCardClick('completedTasks')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100 text-sm font-medium">Completed Tasks</p>
                  <p className="text-3xl font-bold">{stats.totalCompleted}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-orange-200" />
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Metrics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Employee Roles Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-600" />
              Employee Roles
            </h2>
            
            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('managers')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Managers</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">{stats.managerCount}</span>
              </div>
              <div className="text-sm text-gray-600">
                {stats.managerNames.length > 0 ? stats.managerNames.join(', ') : 'No managers assigned'}
              </div>
            </div>

            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('teamLeaders')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <UserCog className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="font-medium text-gray-700">Team Leaders</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{stats.teamLeadCount}</span>
              </div>
              <div className="text-sm text-gray-600">
                {stats.teamLeadNames.length > 0 ? stats.teamLeadNames.join(', ') : 'No team leaders assigned'}
              </div>
            </div>

            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('operators')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-purple-100 p-2 rounded-lg">
                    <User className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="font-medium text-gray-700">Operators</span>
                </div>
                <span className="text-2xl font-bold text-purple-600">{stats.operatorCount}</span>
              </div>
              <div className="text-sm text-gray-600">
                {stats.operatorNames.length > 0 ? stats.operatorNames.join(', ') : 'No operators assigned'}
              </div>
            </div>
          </div>

          {/* Task Categories Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Target className="w-5 h-5 mr-2 text-green-600" />
              Task Categories
            </h2>
            
            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('dailyTasks')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-yellow-100 p-2 rounded-lg">
                    <Calendar className="w-5 h-5 text-yellow-600" />
                  </div>
                  <span className="font-medium text-gray-700">Daily Tasks</span>
                </div>
                <span className="text-2xl font-bold text-yellow-600">{stats.totalDaily}</span>
              </div>
              <p className="text-sm text-gray-500">Tasks that need daily attention</p>
            </div>

            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('weeklyTasks')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-100 p-2 rounded-lg">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-700">Weekly Tasks</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">{stats.totalWeekly}</span>
              </div>
              <p className="text-sm text-gray-500">Tasks with weekly deadlines</p>
            </div>

            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('monthlyTasks')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-indigo-100 p-2 rounded-lg">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="font-medium text-gray-700">Monthly Tasks</span>
                </div>
                <span className="text-2xl font-bold text-indigo-600">{stats.totalMonthly}</span>
              </div>
              <p className="text-sm text-gray-500">Long-term monthly projects</p>
            </div>
          </div>

          {/* Task Status Section */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-purple-600" />
              Task Status
            </h2>
            
            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('pendingTasks')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-orange-100 p-2 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="font-medium text-gray-700">Pending Tasks</span>
                </div>
                <span className="text-2xl font-bold text-orange-600">{stats.totalPendingExclDWM}</span>
              </div>
              <p className="text-sm text-gray-500">Excluding recurring tasks</p>
            </div>

            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('completedTasks')}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-green-100 p-2 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="font-medium text-gray-700">Completed Tasks</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{stats.totalCompleted}</span>
              </div>
              <p className="text-sm text-gray-500">Successfully finished tasks</p>
            </div>

            {/* Progress Bar for Completion Rate */}
            <div 
              className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105"
              onClick={() => handleCardClick('completionRate')}
            >
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-700">Completion Rate</span>
                  <span className="text-sm font-medium text-gray-500">
                    {stats.totalCompleted + stats.totalPendingExclDWM > 0 
                      ? Math.round((stats.totalCompleted / (stats.totalCompleted + stats.totalPendingExclDWM)) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${stats.totalCompleted + stats.totalPendingExclDWM > 0 
                        ? (stats.totalCompleted / (stats.totalCompleted + stats.totalPendingExclDWM)) * 100
                        : 0}%` 
                    }}
                  ></div>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                {stats.totalCompleted} of {stats.totalCompleted + stats.totalPendingExclDWM} tasks completed
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for displaying detailed data */}
      <Modal
        isOpen={selectedModal !== null}
        onClose={closeModal}
        title={modalData?.type ? getModalTitle(modalData.type, department.name) : ''}
        size="xl"
      >
        {renderModalContent()}
      </Modal>

      {/* Task Detail Modal */}
      <Modal
        isOpen={selectedTask !== null}
        onClose={closeTaskView}
        title="Task Details"
        size="lg"
      >
        {selectedTask && <TaskDetailView task={selectedTask} />}
      </Modal>

      {/* Employee Detail Modal */}
      <Modal
        isOpen={selectedEmployee !== null}
        onClose={closeEmployeeView}
        title="Employee Details"
        size="lg"
      >
        {selectedEmployee && <EmployeeDetailView employee={selectedEmployee} />}
      </Modal>
    </div>
  );
}

// Helper function to get modal title
function getModalTitle(cardType, departmentName) {
  const titles = {
    totalEmployees: `${departmentName} - All Employees`,
    totalCost: `${departmentName} - Cost Breakdown`,
    assignedHours: `${departmentName} - Hours Distribution`,
    completedTasks: `${departmentName} - Completed Tasks`,
    managers: `${departmentName} - Managers`,
    teamLeaders: `${departmentName} - Team Leaders`,
    operators: `${departmentName} - Operators`,
    dailyTasks: `${departmentName} - Daily Tasks`,
    weeklyTasks: `${departmentName} - Weekly Tasks`,
    monthlyTasks: `${departmentName} - Monthly Tasks`,
    pendingTasks: `${departmentName} - Pending Tasks`,
    completionRate: `${departmentName} - Task Completion Analytics`
  };
  return titles[cardType] || 'Details';
}

// Component for displaying employee lists
function EmployeeListView({ data, type, onEmployeeClick }) {
  const getTypeLabel = () => {
    switch (type) {
      case 'managers': return 'Managers';
      case 'teamLeaders': return 'Team Leaders';
      case 'operators': return 'Operators';
      default: return 'Employees';
    }
  };

  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{getTypeLabel()}</h3>
        <span className="text-sm text-gray-500">{safeData.length} {getTypeLabel().toLowerCase()}</span>
      </div>
      
      {safeData.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No {getTypeLabel().toLowerCase()} found
        </div>
      ) : (
        <div className="grid gap-4">
          {safeData.map((employee, index) => (
            <div 
              key={employee.id || index} 
              className="bg-gray-50 rounded-lg p-4 border border-gray-200 cursor-pointer hover:bg-gray-100 hover:shadow-md transition-all duration-200"
              onClick={() => onEmployeeClick(employee)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{employee.name}</h4>
                  <p className="text-sm text-gray-600">{employee.designation || 'No designation'}</p>
                  <p className="text-sm text-gray-500">{employee.email || 'No email'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    ${employee.hourly_rate || 0}/hr
                  </p>
                  <p className="text-xs text-gray-500">{employee.employment_type || 'Full-time'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Component for displaying cost breakdown
function CostBreakdownView({ data, department }) {
  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];
  
  const totalCost = safeData.reduce((sum, emp) => {
    const hourlyRate = Number(emp.hourly_rate) || 0;
    const monthlyHours = emp.employment_type === 'Part-time' ? 4 * 26 : 8 * 26;
    return sum + (hourlyRate * monthlyHours);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Total Monthly Cost</h3>
        <p className="text-3xl font-bold text-blue-600">
          ${totalCost.toLocaleString()}
        </p>
        <p className="text-sm text-blue-700">Based on 26 working days per month</p>
      </div>
      
      <div className="grid gap-4">
        {safeData.map((employee, index) => {
          const hourlyRate = Number(employee.hourly_rate) || 0;
          const monthlyHours = employee.employment_type === 'Part-time' ? 4 * 26 : 8 * 26;
          const monthlyCost = hourlyRate * monthlyHours;
          
          return (
            <div key={employee.id || index} className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{employee.name}</h4>
                  <p className="text-sm text-gray-600">{employee.designation || 'No designation'}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">
                    ${monthlyCost.toLocaleString()}/month
                  </p>
                  <p className="text-sm text-gray-500">
                    ${hourlyRate}/hr × {monthlyHours} hrs
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Component for displaying hours distribution
function HoursDistributionView({ data, department }) {
  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];
  
  const totalHours = safeData.reduce((sum, emp) => {
    const monthlyHours = emp.employment_type === 'Part-time' ? 4 * 26 : 8 * 26;
    return sum + monthlyHours;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
        <h3 className="text-lg font-semibold text-purple-900 mb-2">Total Monthly Hours</h3>
        <p className="text-3xl font-bold text-purple-600">
          {totalHours.toLocaleString()} hrs
        </p>
        <p className="text-sm text-purple-700">Based on 26 working days per month</p>
      </div>
      
      <div className="grid gap-4">
        {safeData.map((employee, index) => {
          const monthlyHours = employee.employment_type === 'Part-time' ? 4 * 26 : 8 * 26;
          
          return (
            <div key={employee.id || index} className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{employee.name}</h4>
                  <p className="text-sm text-gray-600">{employee.designation || 'No designation'}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">
                    {monthlyHours} hrs/month
                  </p>
                  <p className="text-sm text-gray-500">
                    {employee.employment_type || 'Full-time'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Component for displaying task lists
function TaskListView({ data, type, onTaskClick }) {
  const getTypeLabel = () => {
    switch (type) {
      case 'dailyTasks': return 'Daily Tasks';
      case 'weeklyTasks': return 'Weekly Tasks';
      case 'monthlyTasks': return 'Monthly Tasks';
      case 'completedTasks': return 'Completed Tasks';
      case 'pendingTasks': return 'Pending Tasks';
      default: return 'Tasks';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Doing': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{getTypeLabel()}</h3>
        <span className="text-sm text-gray-500">{safeData.length} tasks</span>
      </div>
      
      {safeData.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No {getTypeLabel().toLowerCase()} found
        </div>
      ) : (
        <div className="grid gap-4">
          {safeData.map((task, index) => (
            <div 
              key={task.id || index} 
              className="bg-white rounded-lg p-4 border border-gray-200 cursor-pointer hover:bg-gray-50 hover:shadow-md transition-all duration-200"
              onClick={() => onTaskClick(task)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 mb-2">{task.title}</h4>
                  <p className="text-sm text-gray-600 mb-2">{task.description || 'No description'}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                      {task.status || 'Pending'}
                    </span>
                    {task.priority && (
                      <span className="px-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {task.priority}
                      </span>
                    )}
                    {task.department && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {task.department}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500 ml-4">
                  {task.due_date && (
                    <div>
                      <p>Due: {new Date(task.due_date).toLocaleDateString()}</p>
                    </div>
                  )}
                  {task.assigned_to && (
                    <div>
                      <p>Assigned to: {task.assigned_to}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Component for displaying completion analytics
function CompletionAnalyticsView({ data, department }) {
  // Ensure data is an array
  const safeData = Array.isArray(data) ? data : [];
  
  const totalTasks = safeData.length;
  const completedTasks = safeData.filter(t => t.status === 'Completed').length;
  const pendingTasks = safeData.filter(t => t.status === 'Pending').length;
  const inProgressTasks = safeData.filter(t => t.status === 'Doing').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <h3 className="text-lg font-semibold text-green-900 mb-2">Completion Rate</h3>
          <p className="text-3xl font-bold text-green-600">{completionRate}%</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Total Tasks</h3>
          <p className="text-3xl font-bold text-blue-600">{totalTasks}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-100 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{completedTasks}</p>
          <p className="text-sm text-green-700">Completed</p>
        </div>
        <div className="bg-yellow-100 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{pendingTasks}</p>
          <p className="text-sm text-yellow-700">Pending</p>
        </div>
        <div className="bg-blue-100 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{inProgressTasks}</p>
          <p className="text-sm text-blue-700">In Progress</p>
        </div>
      </div>
      
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Task Status Distribution</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Completed</span>
            <div className="flex items-center space-x-2">
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
                ></div>
              </div>
              <span className="text-sm font-medium text-gray-900">{completedTasks}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Pending</span>
            <div className="flex items-center space-x-2">
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${totalTasks > 0 ? (pendingTasks / totalTasks) * 100 : 0}%` }}
                ></div>
              </div>
              <span className="text-sm font-medium text-gray-900">{pendingTasks}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">In Progress</span>
            <div className="flex items-center space-x-2">
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0}%` }}
                ></div>
              </div>
              <span className="text-sm font-medium text-gray-900">{inProgressTasks}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component for displaying task details
function TaskDetailView({ task }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Doing': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Task Header */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-2">{task.title}</h2>
        <div className="flex flex-wrap gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(task.status)}`}>
            {task.status || 'Pending'}
          </span>
          {task.priority && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPriorityColor(task.priority)}`}>
              {task.priority} Priority
            </span>
          )}
          {task.department && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
              {task.department}
            </span>
          )}
        </div>
      </div>

      {/* Task Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Description</h3>
            <p className="text-gray-600 bg-white p-3 rounded-lg border">
              {task.description || 'No description provided'}
            </p>
          </div>
          
          {task.project && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Project</h3>
              <p className="text-gray-600 bg-white p-3 rounded-lg border">{task.project}</p>
            </div>
          )}
          
          {task.labels && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Labels</h3>
              <p className="text-gray-600 bg-white p-3 rounded-lg border">{task.labels}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {task.assigned_to && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Assigned To</h3>
              <p className="text-gray-600 bg-white p-3 rounded-lg border">{task.assigned_to}</p>
            </div>
          )}
          
          {task.due_date && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Due Date</h3>
              <p className="text-gray-600 bg-white p-3 rounded-lg border">
                {new Date(task.due_date).toLocaleDateString()}
              </p>
            </div>
          )}
          
          {task.start_date && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Start Date</h3>
              <p className="text-gray-600 bg-white p-3 rounded-lg border">
                {new Date(task.start_date).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Additional Information */}
      {(task.responsible || task.accountable || task.consulted || task.informed) && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">RACI Matrix</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {task.responsible && (
              <div>
                <span className="text-sm font-medium text-blue-700">Responsible</span>
                <p className="text-blue-600">{task.responsible}</p>
              </div>
            )}
            {task.accountable && (
              <div>
                <span className="text-sm font-medium text-blue-700">Accountable</span>
                <p className="text-blue-600">{task.accountable}</p>
              </div>
            )}
            {task.consulted && (
              <div>
                <span className="text-sm font-medium text-blue-700">Consulted</span>
                <p className="text-blue-600">{task.consulted}</p>
              </div>
            )}
            {task.informed && (
              <div>
                <span className="text-sm font-medium text-blue-700">Informed</span>
                <p className="text-blue-600">{task.informed}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Component for displaying employee details
function EmployeeDetailView({ employee }) {
  return (
    <div className="space-y-6">
      {/* Employee Header */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h2 className="text-xl font-bold text-blue-900 mb-2">{employee.name}</h2>
        <div className="flex flex-wrap gap-2">
          {employee.designation && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              {employee.designation}
            </span>
          )}
          {employee.employment_type && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              {employee.employment_type}
            </span>
          )}
          {employee.work_from && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
              {employee.work_from}
            </span>
          )}
        </div>
      </div>

      {/* Employee Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Contact Information</h3>
            <div className="bg-white p-3 rounded-lg border space-y-2">
              {employee.email && (
                <p className="text-gray-600">
                  <span className="font-medium">Email:</span> {employee.email}
                </p>
              )}
              {employee.phone && (
                <p className="text-gray-600">
                  <span className="font-medium">Phone:</span> {employee.phone}
                </p>
              )}
              {employee.address && (
                <p className="text-gray-600">
                  <span className="font-medium">Address:</span> {employee.address}
                </p>
              )}
            </div>
          </div>
          
          {employee.department && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Department</h3>
              <p className="text-gray-600 bg-white p-3 rounded-lg border">{employee.department}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {employee.hourly_rate && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Compensation</h3>
              <div className="bg-white p-3 rounded-lg border space-y-2">
                <p className="text-gray-600">
                  <span className="font-medium">Hourly Rate:</span> ${employee.hourly_rate}/hr
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Monthly Cost:</span> $
                  {employee.employment_type === 'Part-time' 
                    ? (employee.hourly_rate * 4 * 26).toLocaleString()
                    : (employee.hourly_rate * 8 * 26).toLocaleString()
                  }/month
                </p>
              </div>
            </div>
          )}
          
          {employee.hire_date && (
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Employment Details</h3>
              <div className="bg-white p-3 rounded-lg border space-y-2">
                <p className="text-gray-600">
                  <span className="font-medium">Hire Date:</span> {new Date(employee.hire_date).toLocaleDateString()}
                </p>
                {employee.employment_type && (
                  <p className="text-gray-600">
                    <span className="font-medium">Type:</span> {employee.employment_type}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Information */}
      {(employee.emergency_contact || employee.emergency_phone) && (
        <div className="bg-yellow-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-yellow-900 mb-3">Emergency Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {employee.emergency_contact && (
              <div>
                <span className="text-sm font-medium text-yellow-700">Contact Person</span>
                <p className="text-yellow-600">{employee.emergency_contact}</p>
              </div>
            )}
            {employee.emergency_phone && (
              <div>
                <span className="text-sm font-medium text-yellow-700">Phone</span>
                <p className="text-yellow-600">{employee.emergency_phone}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}













