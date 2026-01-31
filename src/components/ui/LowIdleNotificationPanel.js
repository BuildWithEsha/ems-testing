import React, { useState, useEffect } from 'react';
import { X, User, Settings, Download, Clock, Building, Search, ChevronDown, ChevronRight } from 'lucide-react';

const LowIdleNotificationPanel = ({
  isOpen,
  onClose,
  lowIdleNotifications,
  startDate,
  endDate,
  minIdleHours,
  minIdleMinutes,
  onUpdateSettings,
  loading,
  error
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);
  const [tempMinIdleHours, setTempMinIdleHours] = useState(minIdleHours);
  const [tempMinIdleMinutes, setTempMinIdleMinutes] = useState(minIdleMinutes);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());

  const displayStart = typeof startDate === 'string' ? startDate : new Date().toISOString().split('T')[0];
  const displayEnd = typeof endDate === 'string' ? endDate : new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (showSettings) {
      setTempStartDate(startDate);
      setTempEndDate(endDate);
      setTempMinIdleHours(minIdleHours);
      setTempMinIdleMinutes(minIdleMinutes);
    }
  }, [showSettings, startDate, endDate, minIdleHours, minIdleMinutes]);

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
    const h = Number(tempMinIdleHours) || 0;
    const m = Number(tempMinIdleMinutes) || 0;
    if (h >= 0 && h <= 24 && m >= 0 && m <= 59 && tempStartDate && tempEndDate) {
      if (onUpdateSettings) {
        onUpdateSettings(tempStartDate, tempEndDate, h, m);
      }
      setShowSettings(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Employee Name', 'Email', 'Employee Code', 'Department', 'Idle (H:MM:SS)', 'Date Range'],
      ...filtered.map((n) => [
        n.employeeName || 'N/A',
        n.email || 'N/A',
        n.employeeCode || 'N/A',
        n.department || 'Unassigned',
        formatIdleHMS(n.idleHours),
        n.dateRange || `${displayStart} to ${displayEnd}`
      ])
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `idle-employees-${displayStart}-${displayEnd}-min${minIdleHours}h${minIdleMinutes}m.csv`;
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
              <h2 className="text-xl font-semibold text-gray-900">High Idle Employees (Tracking App)</h2>
              <p className="text-sm text-gray-600">
                Employees with more than {minIdleHours}h {minIdleMinutes}m idle from {displayStart} to {displayEnd} (Team Logger API)
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-colors"
              title="Configure date range and min idle"
            >
              <Settings className="w-4 h-4" />
              <span>Min {minIdleHours}h {minIdleMinutes}m · {displayStart} – {displayEnd}</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="p-4 bg-teal-50 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-3">Show employees with more than this idle time in the date range:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                <input
                  type="date"
                  value={typeof tempStartDate === 'string' ? tempStartDate : ''}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End date</label>
                <input
                  type="date"
                  value={typeof tempEndDate === 'string' ? tempEndDate : ''}
                  onChange={(e) => setTempEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min idle (hours : minutes)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="24"
                    value={tempMinIdleHours}
                    onChange={(e) => setTempMinIdleHours(Number(e.target.value) || 0)}
                    className="w-14 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-center"
                    placeholder="0"
                  />
                  <span className="text-gray-500 font-medium">h</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={tempMinIdleMinutes}
                    onChange={(e) => setTempMinIdleMinutes(Number(e.target.value) || 0)}
                    className="w-14 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm text-center"
                    placeholder="0"
                  />
                  <span className="text-gray-500 font-medium">m</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSettingsUpdate}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
                >
                  Update
                </button>
                <button
                  onClick={() => {
                    setTempStartDate(startDate);
                    setTempEndDate(endDate);
                    setTempMinIdleHours(minIdleHours);
                    setTempMinIdleMinutes(minIdleMinutes);
                    setShowSettings(false);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
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
                {filtered.length} employee{filtered.length !== 1 ? 's' : ''} above threshold
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
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-center px-4">
              <Clock className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No employees above threshold</p>
              <p className="text-sm mb-2">No employees with more than {minIdleHours}h {minIdleMinutes}m idle from {displayStart} to {displayEnd}.</p>
              <p className="text-xs text-gray-400">Try lowering the minimum idle (e.g. 0h 30m) or pick a different date range. If the range is in the future, Team Logger may have no data yet.</p>
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
                        <div key={`${n.email}-${n.dateRange || displayStart}-${idx}`} className="p-4 hover:bg-gray-50">
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
                              <p className="text-xs text-gray-500 mt-1">{n.dateRange || `${startDate} to ${endDate}`}</p>
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
              Showing {filtered.length} of {(lowIdleNotifications || []).length} employees with more than {minIdleHours}h {minIdleMinutes}m idle
            </span>
            <span>
              Range: {displayStart} – {displayEnd}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LowIdleNotificationPanel;
