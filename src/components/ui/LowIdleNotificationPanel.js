import React, { useState, useEffect } from 'react';
import { X, User, Settings, Download, Clock, Building, Search, ChevronDown, ChevronRight } from 'lucide-react';

const LowIdleNotificationPanel = ({
  isOpen,
  onClose,
  lowIdleNotifications,
  maxIdleHours,
  selectedDate,
  onUpdateSettings,
  onUpdateMaxIdleHours,
  onUpdateSelectedDate,
  loading,
  error
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [tempMaxIdleHours, setTempMaxIdleHours] = useState(maxIdleHours);
  const [tempSelectedDate, setTempSelectedDate] = useState(selectedDate);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());

  useEffect(() => {
    if (showSettings) {
      setTempMaxIdleHours(maxIdleHours);
      setTempSelectedDate(selectedDate);
    }
  }, [showSettings, maxIdleHours, selectedDate]);

  const getUniqueDepartments = () => {
    const depts = (lowIdleNotifications || []).map((n) => n.department || 'Unassigned');
    return [...new Set(depts)].sort();
  };

  const filtered = (lowIdleNotifications || []).filter(
    (n) =>
      (!searchTerm ||
        (n.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.email || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
      (!departmentFilter || (n.department || 'Unassigned') === departmentFilter)
  );

  // Group filtered list by department (same as LHE)
  const groupedByDepartment = filtered.reduce((acc, n) => {
    const dept = n.department || 'Unassigned';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(n);
    return acc;
  }, {});

  const handleDepartmentToggle = (dept) => {
    const next = new Set(expandedDepartments);
    if (next.has(dept)) next.delete(dept);
    else next.add(dept);
    setExpandedDepartments(next);
  };

  // Format decimal hours as H:MM:SS or HH:MM:SS (per report style)
  const formatIdleHMS = (idleHours) => {
    const totalSec = Math.round(Number(idleHours) * 3600);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSettingsUpdate = () => {
    if (tempMaxIdleHours >= 0 && tempMaxIdleHours <= 24) {
      if (onUpdateSettings) {
        onUpdateSettings(tempMaxIdleHours, tempSelectedDate);
      } else {
        onUpdateMaxIdleHours(tempMaxIdleHours);
        onUpdateSelectedDate(tempSelectedDate);
      }
      setShowSettings(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Employee Name', 'Email', 'Employee Code', 'Department', 'Idle (H:MM:SS)', 'Date'],
      ...filtered.map((n) => [
        n.employeeName || 'N/A',
        n.email || 'N/A',
        n.employeeCode || 'N/A',
        n.department || 'Unassigned',
        formatIdleHMS(n.idleHours),
        n.date || 'N/A'
      ])
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `low-idle-employees-${selectedDate}-max${maxIdleHours}h.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-teal-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Low Idle Employees (Tracking App)</h2>
              <p className="text-sm text-gray-600">
                Employees with less than {maxIdleHours} hours idle on {selectedDate} (from Team Logger API)
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-colors"
              title="Configure"
            >
              <Settings className="w-4 h-4" />
              <span>Max {maxIdleHours}h idle</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="p-4 bg-teal-50 border-b border-gray-200 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Show employees with less than (hours idle):</label>
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={tempMaxIdleHours}
                onChange={(e) => setTempMaxIdleHours(parseFloat(e.target.value) ?? 3)}
                className="w-20 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Date:</label>
              <input
                type="date"
                value={tempSelectedDate}
                onChange={(e) => setTempSelectedDate(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <button
              onClick={handleSettingsUpdate}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              Update
            </button>
            <button
              onClick={() => {
                setTempMaxIdleHours(maxIdleHours);
                setTempSelectedDate(selectedDate);
                setShowSettings(false);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Filters & Actions (same layout as LHE) */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 w-64"
                />
              </div>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">All Departments</option>
                {getUniqueDepartments().map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {filtered.length} employee{filtered.length !== 1 ? 's' : ''} below threshold
              </span>
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Content: department-wise groups (same as LHE) */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Clock className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No Low Idle Employees</p>
              <p className="text-sm">No employees with less than {maxIdleHours} hours idle on {selectedDate}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedByDepartment).map(([department, notifications]) => (
                <div key={department} className="border border-gray-200 rounded-lg overflow-hidden">
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
                      <span className="px-2 py-1 text-xs bg-teal-100 text-teal-700 rounded-full">
                        {notifications.length} employee{notifications.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>
                  {expandedDepartments.has(department) && (
                    <div className="divide-y divide-gray-100">
                      {notifications.map((n, idx) => (
                        <div key={`${n.email}-${n.date}-${idx}`} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3">
                              <User className="w-5 h-5 text-gray-400 mt-1" />
                              <div>
                                <h4 className="font-medium text-gray-900">{n.employeeName || 'N/A'}</h4>
                                <p className="text-sm text-gray-500">
                                  {n.email || ''}
                                  {n.employeeCode ? ` · ID: ${n.employeeCode}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="px-3 py-1 text-sm font-medium rounded-full bg-teal-100 text-teal-800">
                                {formatIdleHMS(n.idleHours)} idle
                              </span>
                              <p className="text-xs text-gray-500 mt-1">{n.date}</p>
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

        {/* Footer (same style as LHE) */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Showing {filtered.length} of {(lowIdleNotifications || []).length} employees below {maxIdleHours}h idle threshold
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

export default LowIdleNotificationPanel;
