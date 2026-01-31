import React, { useState, useEffect } from 'react';
import { X, User, Settings, Download, Clock } from 'lucide-react';

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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
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

        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">All Departments</option>
            {getUniqueDepartments().map((dept) => (
              <option key={dept} value={dept}>{dept || 'Unassigned'}</option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <span className="text-sm text-gray-600">
            {filtered.length} employee{filtered.length !== 1 ? 's' : ''} with &lt; {maxIdleHours}h idle
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No employees with less than {maxIdleHours} hours idle on {selectedDate}.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filtered.map((n, idx) => (
                <li key={`${n.email}-${n.date}-${idx}`} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{n.employeeName || 'N/A'}</p>
                      <p className="text-sm text-gray-500">
                        {n.email || ''} {n.employeeCode ? ` · ${n.employeeCode}` : ''}
                        {n.department ? ` · ${n.department}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-teal-100 text-teal-800">
                      {formatIdleHMS(n.idleHours)} idle
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{n.date}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 text-sm text-gray-600">
          Data fetched from Team Logger API (employee_summary_report) for the selected date.
        </div>
      </div>
    </div>
  );
};

export default LowIdleNotificationPanel;
