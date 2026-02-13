import React, { memo, useMemo } from 'react';
import {
  Users,
  Briefcase,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Bell
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import EmployeeHealth from './EmployeeHealth';
import { useNotifications } from '../../hooks/useNotifications';

const Dashboard = memo(({ employees, tasks, departments, stats }) => {
  const { user } = useAuth();
  const { notifications, hasNotifications } = useNotifications();

  // Memoize calculations, prioritizing passed stats
  const dashboardStats = useMemo(() => {
    const safeEmployeesCount = stats?.totalEmployees ?? (Array.isArray(employees) ? employees.length : 0);
    const safeTasksCount = stats?.totalTasks ?? (Array.isArray(tasks) ? tasks.length : 0);
    const completedTasksCount = stats?.completedTasks ?? (Array.isArray(tasks) ? tasks.filter(t => t.status === 'Completed').length : 0);
    const overdueTasksCount = stats?.overdueTasks ?? (Array.isArray(tasks) ? tasks.filter(t => t.status === 'Due').length : 0);

    return [
      {
        title: 'Total Employees',
        value: safeEmployeesCount,
        icon: Users,
        color: 'bg-blue-500',
        change: '+12%',
        changeType: 'positive'
      },
      {
        title: 'Active Tasks',
        value: safeTasksCount,
        icon: Briefcase,
        color: 'bg-indigo-500',
        change: '+5%',
        changeType: 'positive'
      },
      {
        title: 'Completed Tasks',
        value: completedTasksCount,
        icon: CheckCircle,
        color: 'bg-green-500',
        change: '+8%',
        changeType: 'positive'
      },
      {
        title: 'Overdue Tasks',
        value: overdueTasksCount,
        icon: AlertTriangle,
        color: 'bg-red-500',
        change: '-3%',
        changeType: 'negative'
      }
    ];
  }, [employees.length, tasks.length, tasks, stats]);

  const recentTasks = useMemo(() => {
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    return safeTasks.slice(0, 5);
  }, [tasks]);

  const recentEmployees = useMemo(() => {
    const safeEmployees = Array.isArray(employees) ? employees : [];
    return safeEmployees.slice(0, 5);
  }, [employees]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {dashboardStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  <div className="flex items-center mt-2">
                    <span className={`text-sm ${stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {stat.change}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">from last month</span>
                  </div>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* DWM Task Notifications Alert */}
      {hasNotifications && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Bell className="w-6 h-6 text-red-500" />
            <div className="flex-1">
              <h3 className="text-lg font-medium text-red-800">
                DWM Task Notifications
              </h3>
              <p className="text-red-700">
                You have {notifications.length} incomplete DWM task{notifications.length !== 1 ? 's' : ''} from yesterday that require attention.
              </p>
              <p className="text-sm text-red-600 mt-1">
                Only showing tasks that were actually due on {notifications[0]?.displayDate || 'yesterday'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-red-100 text-red-800 text-sm font-medium px-3 py-1 rounded-full">
                {notifications.length} pending
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tasks */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Tasks</h3>
          </div>
          <div className="p-6">
            {recentTasks.length > 0 ? (
              <div className="space-y-4">
                {recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{task.title}</p>
                      <p className="text-sm text-gray-500">{task.department}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${task.status === 'Completed' ? 'bg-green-100 text-green-800' :
                      task.status === 'Doing' ? 'bg-blue-100 text-blue-800' :
                        task.status === 'Due' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                      }`}>
                      {task.status || 'To Do'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No tasks found</p>
            )}
          </div>
        </div>

        {/* Recent Employees */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Employees</h3>
          </div>
          <div className="p-6">
            {recentEmployees.length > 0 ? (
              <div className="space-y-4">
                {recentEmployees.map((employee) => (
                  <div key={employee.id} className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium">
                        {employee.name?.charAt(0) || 'U'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{employee.name}</p>
                      <p className="text-sm text-gray-500">{employee.department}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No employees found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

Dashboard.displayName = 'Dashboard';

export default Dashboard; 