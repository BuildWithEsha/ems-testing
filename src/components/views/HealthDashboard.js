import React, { useState, useEffect, memo, useMemo, useCallback } from 'react';
import HealthSettings from './HealthSettings';

const HealthDashboard = memo(() => {
  const [employees, setEmployees] = useState([]);
  const [healthData, setHealthData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [sortBy, setSortBy] = useState('healthScore');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [showHealthSettings, setShowHealthSettings] = useState(false);

  useEffect(() => {
    fetchEmployees();
    
    // Add a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (loading) {
        console.log('HealthDashboard - Loading timeout, setting loading to false');
        setLoading(false);
      }
    }, 10000); // 10 second timeout
    
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (employees.length > 0) {
      fetchAllHealthData();
    }
  }, [employees]);

  const fetchEmployees = useCallback(async () => {
    try {
      const response = await fetch('/api/employees');
      if (!response.ok) {
        throw new Error('Failed to fetch employees');
      }
      const data = await response.json();
      // Handle both paginated and non-paginated responses
      const employeesData = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      console.log('HealthDashboard - Employees data:', employeesData);
      setEmployees(employeesData);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to fetch employees: ' + err.message);
      setLoading(false);
    }
  }, []);

  const fetchAllHealthData = async () => {
    try {
      setLoading(true);
      console.log('HealthDashboard - Fetching health data for', employees.length, 'employees');
      
      if (employees.length === 0) {
        console.log('HealthDashboard - No employees to fetch health data for');
        setLoading(false);
        return;
      }
      
      const healthPromises = (employees || []).map(emp => 
        fetch(`/api/employees/${emp.id}/health`)
          .then(res => {
            if (res.ok) {
              return res.json();
            } else {
              console.warn(`Health API failed for employee ${emp.id}:`, res.status);
              return null;
            }
          })
          .catch(error => {
            console.warn(`Health API error for employee ${emp.id}:`, error.message);
            return null;
          })
      );

      const healthResults = await Promise.all(healthPromises);
      const healthMap = {};
      
      (employees || []).forEach((emp, index) => {
        if (healthResults[index]) {
          healthMap[emp.id] = healthResults[index];
        }
      });

      console.log('HealthDashboard - Health data fetched:', healthMap);
      setHealthData(healthMap);
      
      // If no health data was fetched, show a warning but don't fail
      if (Object.keys(healthMap).length === 0) {
        console.warn('HealthDashboard - No health data available for any employees');
      }
    } catch (err) {
      console.error('Error fetching health data:', err);
      setError('Failed to fetch health data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getHealthScoreColor = (score, healthSettings = {}) => {
    const topThreshold = healthSettings.top_rated_threshold?.value || 300;
    const avgThreshold = healthSettings.average_threshold?.value || 200;
    
    if (score >= topThreshold) return 'text-green-600 bg-green-100';
    if (score >= avgThreshold) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const getRatingColor = (rating) => {
    switch (rating) {
      case 'Excellent': return 'text-green-600 bg-green-100';
      case 'Good': return 'text-blue-600 bg-blue-100';
      case 'Average': return 'text-orange-600 bg-orange-100';
      case 'Poor': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getFilteredAndSortedEmployees = () => {
    let filtered = employees;
    
    // Filter by search term (employee name)
    if (searchTerm.trim()) {
      filtered = filtered.filter(emp => 
        emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Filter by department
    if (filterDepartment !== 'all') {
      filtered = filtered.filter(emp => emp.department === filterDepartment);
    }

    // Sort employees
    filtered.sort((a, b) => {
      const aData = healthData[a.id];
      const bData = healthData[b.id];
      
      if (!aData && !bData) return 0;
      if (!aData) return 1;
      if (!bData) return -1;

      let aValue, bValue;
      
      switch (sortBy) {
        case 'healthScore':
          aValue = aData.healthScore || 0;
          bValue = bData.healthScore || 0;
          break;
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'department':
          aValue = a.department;
          bValue = b.department;
          break;
        default:
          aValue = aData.healthScore || 0;
          bValue = bData.healthScore || 0;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  };

  const getDepartments = () => {
    const depts = [...new Set((employees || []).map(emp => emp.department))];
    return depts.filter(dept => dept);
  };

  const getOverallStats = () => {
    const validHealthData = Object.values(healthData).filter(data => data);
    
    if (validHealthData.length === 0) return null;

    const totalScore = validHealthData.reduce((sum, data) => sum + (data.healthScore || 0), 0);
    const avgScore = totalScore / validHealthData.length;
    
    const excellent = validHealthData.filter(data => data.rating === 'Excellent').length;
    const good = validHealthData.filter(data => data.rating === 'Good').length;
    const average = validHealthData.filter(data => data.rating === 'Average').length;
    const poor = validHealthData.filter(data => data.rating === 'Poor').length;

    return {
      totalEmployees: validHealthData.length,
      averageScore: Math.round(avgScore),
      excellent,
      good,
      average,
      poor
    };
  };

  // Move useMemo hooks before any early returns to follow Rules of Hooks
  const filteredEmployees = useMemo(() => getFilteredAndSortedEmployees(), [employees, searchTerm, filterDepartment, sortBy, sortOrder, healthData]);
  const stats = useMemo(() => getOverallStats(), [healthData]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-gray-600">Loading health dashboard...</p>
        <p className="text-sm text-gray-500">Fetching employee data and health scores</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">Error: {error}</p>
        <button
          onClick={fetchEmployees}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Employee Health Dashboard</h1>
            <p className="text-gray-600">Monitor the overall health and performance status of all employees</p>
          </div>
          <button
            onClick={() => setShowHealthSettings(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Health Settings
          </button>
        </div>
      </div>

      {/* Overall Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-indigo-100">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalEmployees}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average Score</p>
                <p className="text-2xl font-bold text-gray-900">{stats.averageScore}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Excellent</p>
                <p className="text-2xl font-bold text-gray-900">{stats.excellent}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-orange-100">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Needs Attention</p>
                <p className="text-2xl font-bold text-gray-900">{stats.average + stats.poor}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Controls */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Departments</option>
                {getDepartments().map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                Search Employees
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or email..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="healthScore">Health Score</option>
                <option value="name">Name</option>
                <option value="department">Department</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterDepartment('all');
                setSortBy('healthScore');
                setSortOrder('desc');
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors duration-200 flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear Filters
            </button>
            <button
              onClick={fetchAllHealthData}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
              Refresh Data
            </button>
          </div>
        </div>
      </div>

              {/* Employee Health Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Employee Health Status</h3>
              <div className="text-sm text-gray-500">
                {filteredEmployees.length} of {employees.length} employees
                {searchTerm && (
                  <span className="ml-2 text-indigo-600">
                    matching "{searchTerm}"
                  </span>
                )}
              </div>
            </div>
          </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task Completion</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Working Hours</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Errors</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warning Letters</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => {
                const health = healthData[employee.id];
                return (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-indigo-600">
                              {employee.name?.charAt(0)?.toUpperCase() || 'E'}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                          <div className="text-sm text-gray-500">{employee.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {employee.department || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {health ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getHealthScoreColor(health.healthScore)}`}>
                          {health.healthScore || 0}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {health ? (
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRatingColor(health.rating)}`}>
                          {health.rating || 'N/A'}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {health ? (
                        <span className={health.calculations?.tasks?.score >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {health.calculations?.tasks?.completed || 0}/{health.calculations?.tasks?.total || 0}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {health ? (
                        <div className="bg-white rounded-lg shadow-sm border p-4 min-w-[250px]">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center">
                              <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                              Working Hours
                            </h3>
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Total Score</div>
                              <div className={`text-lg font-bold ${health.calculations?.hours?.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {health.calculations?.hours?.score || 0}
                              </div>
                            </div>
                          </div>
                          
                          {health.calculations?.hours?.monthlyBreakdown && (
                            <div className="mb-3">
                              {/* Column Headers */}
                              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-700 mb-2 pb-1 border-b border-gray-200">
                                <span></span>
                                <span>Hours Required</span>
                                <span>Hours Provided</span>
                                <span>Points Earned</span>
                              </div>
                              
                              {/* Monthly Rows */}
                              <div className="space-y-2">
                                {health.calculations.hours.monthlyBreakdown.map((month, index) => (
                                  <div key={index} className="grid grid-cols-4 gap-2 text-xs">
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
                          )}
                          
                          <div className="text-xs text-gray-500">
                            8 points per month when full hours are provided
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {health ? (
                        <span className="text-red-600">
                          -{Math.abs(health.calculations?.errors?.score || 0)}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {health ? (
                        <div className="flex flex-col space-y-1">
                          <span className="text-red-600 font-semibold">
                            -{Math.abs(health.calculations?.warningLetters?.score || 0)}
                          </span>
                          <div className="text-xs text-gray-500">
                            {health.calculations?.warningLetters?.high > 0 && (
                              <span className="inline-block bg-red-100 text-red-800 px-1 rounded mr-1">
                                H:{health.calculations.warningLetters.high}
                              </span>
                            )}
                            {health.calculations?.warningLetters?.medium > 0 && (
                              <span className="inline-block bg-yellow-100 text-yellow-800 px-1 rounded mr-1">
                                M:{health.calculations.warningLetters.medium}
                              </span>
                            )}
                            {health.calculations?.warningLetters?.low > 0 && (
                              <span className="inline-block bg-orange-100 text-orange-800 px-1 rounded">
                                L:{health.calculations.warningLetters.low}
                              </span>
                            )}
                            {(!health.calculations?.warningLetters?.high && 
                              !health.calculations?.warningLetters?.medium && 
                              !health.calculations?.warningLetters?.low) && (
                              <span className="text-green-600">No warnings</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {health ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          health.healthScore >= 300 ? 'bg-green-100 text-green-800' :
                          health.healthScore >= 200 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {health.healthScore >= 300 ? 'Healthy' :
                           health.healthScore >= 200 ? 'Warning' : 'Critical'}
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredEmployees.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No employees found</h3>
            <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or refresh the data.</p>
          </div>
        )}
        
        {filteredEmployees.length > 0 && Object.keys(healthData).length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No health data available</h3>
            <p className="mt-1 text-sm text-gray-500">Health data is being calculated or is not available for the selected employees.</p>
            <button
              onClick={() => {
                setLoading(true);
                fetchAllHealthData();
              }}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Information Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-3">Health Score Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-700">
          <div>
            <h4 className="font-semibold mb-2 text-blue-800">🟢 Excellent (300+ points)</h4>
            <p>Employees performing at optimal levels with consistent task completion and minimal errors.</p>
          </div>
          <div>
            <h4 className="font-semibold mb-2 text-blue-800">🟡 Average (200-299 points)</h4>
            <p>Employees with room for improvement in specific areas.</p>
          </div>
          <div>
            <h4 className="font-semibold mb-2 text-blue-800">🔴 Needs Attention (Below 200)</h4>
            <p>Employees requiring support and intervention to improve performance.</p>
          </div>
        </div>
      </div>

      {/* Health Settings Modal */}
      <HealthSettings
        isOpen={showHealthSettings}
        onClose={() => setShowHealthSettings(false)}
        onSave={() => {
          // Refresh health data when settings are saved
          fetchAllHealthData();
        }}
      />
    </div>
  );
});

HealthDashboard.displayName = 'HealthDashboard';

export default HealthDashboard;
