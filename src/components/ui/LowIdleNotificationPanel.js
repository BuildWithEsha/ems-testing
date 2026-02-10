import React, { useState, useEffect } from 'react';
import { X, User, Settings, Download, Clock, Building, Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useDraggableModal } from '../../hooks/useDraggableModal';

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
  error,
  currentlyIdleList = [],
  currentlyIdleLoading = false,
  currentlyIdleError = null,
  currentlyIdleWindowMinutes = 15,
  currentlyIdleMinMinutes = 1,
  onCurrentlyIdleWindowChange,
  onCurrentlyIdleMinMinutesChange,
  onRefreshCurrentlyIdle,
  onFetchCurrentlyIdle,
  // New props for accountability sections
  isAdmin = false,
  accountabilityPending = [],
  accountabilityResolved = [],
  accountabilityLoading = false,
  accountabilityError = null,
  accountabilityDate,
  onChangeAccountabilityDate,
  onRefreshAccountability
}) => {
  const [viewMode, setViewMode] = useState(
    isAdmin ? 'range' : 'pendingAccountability'
  ); // 'range' | 'current' | 'pendingAccountability' | 'resolvedAccountability'
  const [showSettings, setShowSettings] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(startDate);
  const [tempEndDate, setTempEndDate] = useState(endDate);
  const [tempMinIdleHours, setTempMinIdleHours] = useState(minIdleHours);
  const [tempMinIdleMinutes, setTempMinIdleMinutes] = useState(minIdleMinutes);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [categories, setCategories] = useState([]);
  const [selectedPendingId, setSelectedPendingId] = useState(null);
  const [reasonForm, setReasonForm] = useState({
    category: '',
    subcategory: '',
    reason: ''
  });
  const [reasonSubmitting, setReasonSubmitting] = useState(false);

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

  useEffect(() => {
    if (viewMode === 'current' && isOpen && onFetchCurrentlyIdle) {
      onFetchCurrentlyIdle({ windowMinutes: currentlyIdleWindowMinutes, minIdleMinutes: currentlyIdleMinMinutes });
    }
  }, [viewMode, isOpen]);

  useEffect(() => {
    if (!isAdmin && isOpen) {
      // Load reason categories for employee accountability form
      (async () => {
        try {
          const res = await fetch('/api/idle-accountability/categories');
          if (!res.ok) return;
          const data = await res.json();
          setCategories(Array.isArray(data) ? data : []);
        } catch {
          // ignore
        }
      })();
    }
  }, [isAdmin, isOpen]);

  const listForView = viewMode === 'current' ? (currentlyIdleList || []) : (lowIdleNotifications || []);

  const getUniqueDepartments = () => {
    const depts = listForView.map((n) => n.department || 'Unassigned');
    return [...new Set(depts)].sort();
  };

  const filtered = listForView.filter(
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

  const { modalRef, modalStyle, dragHandleProps } = useDraggableModal(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={modalRef} style={modalStyle} className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 cursor-move" {...dragHandleProps}>
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-teal-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">High Idle Employees (Tracking App)</h2>
              <p className="text-sm text-gray-600">
                {isAdmin ? (
                  viewMode === 'current'
                    ? `Employees idle in the last ${currentlyIdleWindowMinutes} min (≥${currentlyIdleMinMinutes} min) – Team Logger API`
                    : `Employees with more than ${minIdleHours}h ${minIdleMinutes}m idle from ${displayStart} to ${displayEnd} (Team Logger API)`
                ) : (
                  'View your own idle accountability records (pending and resolved) for the selected date.'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isAdmin && viewMode === 'range' && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center space-x-2 px-3 py-2 text-sm bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-colors"
                title="Configure date range and min idle"
              >
                <Settings className="w-4 h-4" />
                <span>Min {minIdleHours}h {minIdleMinutes}m · {displayStart} – {displayEnd}</span>
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setViewMode('range')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                  viewMode === 'range'
                    ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                By date range
              </button>
              <button
                type="button"
                onClick={() => setViewMode('current')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                  viewMode === 'current'
                    ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Idle in last X min
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setViewMode('pendingAccountability')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              viewMode === 'pendingAccountability'
                ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Pending Accountability
          </button>
          <button
            type="button"
            onClick={() => setViewMode('resolvedAccountability')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              viewMode === 'resolvedAccountability'
                ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Resolved Accountability
          </button>
        </div>

        {/* Currently idle toolbar + note (same data as date range today + min idle; real-time would need Team Logger API) */}
        {isAdmin && viewMode === 'current' && (
          <>
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
            Same data as <strong>By date range</strong> with today + min idle. Real-time idle (like Team Logger’s in-app filter) would require a live API from Team Logger.
          </div>
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4">
            <span className="text-sm text-gray-600">Window:</span>
            <select
              value={currentlyIdleWindowMinutes}
              onChange={(e) => {
                const v = Number(e.target.value);
                onCurrentlyIdleWindowChange?.(v);
                onFetchCurrentlyIdle?.({ windowMinutes: v, minIdleMinutes: currentlyIdleMinMinutes });
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
            >
              <option value={5}>Last 5 min</option>
              <option value={15}>Last 15 min</option>
              <option value={30}>Last 30 min</option>
            </select>
            <span className="text-sm text-gray-600">Min idle:</span>
            <select
              value={currentlyIdleMinMinutes}
              onChange={(e) => {
                const v = Number(e.target.value);
                onCurrentlyIdleMinMinutesChange?.(v);
                onFetchCurrentlyIdle?.({ windowMinutes: currentlyIdleWindowMinutes, minIdleMinutes: v });
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
            >
              <option value={1}>1 min</option>
              <option value={2}>2 min</option>
              <option value={5}>5 min</option>
            </select>
            <button
              type="button"
              onClick={() => onFetchCurrentlyIdle?.({ windowMinutes: currentlyIdleWindowMinutes, minIdleMinutes: currentlyIdleMinMinutes })}
              disabled={currentlyIdleLoading}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-100 rounded-lg hover:bg-teal-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${currentlyIdleLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          </>
        )}

        {isAdmin && showSettings && viewMode !== 'current' && (
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

        {/* Accountability views */}
        {(viewMode === 'pendingAccountability' || viewMode === 'resolvedAccountability') && (
          <>
            {isAdmin ? (
              <div className="flex-1 overflow-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600">
                    Showing idle accountability records above 20 minutes for date range{' '}
                    <span className="font-medium">
                      {displayStart} – {displayEnd}
                    </span>
                    .
                  </div>
                  <div className="flex items-center space-x-2">
                    {onRefreshAccountability && (
                      <button
                        type="button"
                        onClick={() => onRefreshAccountability()}
                        className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        Refresh
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSettings(true)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Change date range
                    </button>
                  </div>
                </div>
                {accountabilityError && (
                  <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
                    {accountabilityError}
                  </div>
                )}
                {accountabilityLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-500">
                    Loading accountability records...
                  </div>
                ) : (
                  (() => {
                    const rows =
                      viewMode === 'pendingAccountability'
                        ? accountabilityPending
                        : accountabilityResolved;
                    if (!rows || rows.length === 0) {
                      return (
                        <div className="flex items-center justify-center py-12 text-gray-500">
                          {viewMode === 'pendingAccountability'
                            ? 'No pending accountability items in this date range.'
                            : 'No resolved accountability items in this date range.'}
                        </div>
                      );
                    }

                    const searchLower = searchTerm.toLowerCase();
                    const rowsFiltered = rows.filter((r) => {
                      const dept = r.department || 'Unassigned';
                      const matchesDept =
                        !departmentFilter || dept === departmentFilter;
                      const empName = (r.employee_name || '').toLowerCase();
                      const empEmail = (r.employee_email || '').toLowerCase();
                      const matchesSearch =
                        !searchLower ||
                        empName.includes(searchLower) ||
                        empEmail.includes(searchLower);
                      return matchesDept && matchesSearch;
                    });

                    const grouped = rowsFiltered.reduce((acc, r) => {
                      const dept = r.department || 'Unassigned';
                      if (!acc[dept]) acc[dept] = [];
                      acc[dept].push(r);
                      return acc;
                    }, {});

                    const deptKeys = Object.keys(grouped).sort();

                    return (
                      <>
                        <div className="p-4 border border-gray-200 rounded-lg mb-4 bg-gray-50">
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
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                              >
                                <option value="">All Departments</option>
                                {deptKeys.map((dept) => (
                                  <option key={dept} value={dept}>
                                    {dept}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <span className="text-sm text-gray-600">
                              {rowsFiltered.length} record
                              {rowsFiltered.length !== 1 ? 's' : ''} in{' '}
                              {deptKeys.length} department
                              {deptKeys.length !== 1 ? 's' : ''}.
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {deptKeys.map((dept) => {
                            const deptRows = grouped[dept] || [];
                            return (
                              <div
                                key={dept}
                                className="border border-gray-200 rounded-lg overflow-hidden"
                              >
                                <button
                                  onClick={() => handleDepartmentToggle(dept)}
                                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                                >
                                  <div className="flex items-center space-x-3">
                                    {expandedDepartments.has(dept) ? (
                                      <ChevronDown className="w-5 h-5 text-gray-500" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-gray-500" />
                                    )}
                                    <Building className="w-5 h-5 text-gray-500" />
                                    <span className="font-medium text-gray-900">
                                      {dept}
                                    </span>
                                    <span className="px-2 py-1 text-xs bg-teal-100 text-teal-700 rounded-full">
                                      {deptRows.length} record
                                      {deptRows.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                </button>
                                {expandedDepartments.has(dept) && (
                                  <div className="divide-y divide-gray-100">
                                    {deptRows.map((item) => (
                                      <div
                                        key={item.id}
                                        className="p-4 hover:bg-gray-50 flex items-start justify-between"
                                      >
                                        <div>
                                          <div className="text-sm text-gray-500 mb-1">
                                            Date:{' '}
                                            <span className="font-medium text-gray-900">
                                              {item.date}
                                            </span>
                                          </div>
                                          <div className="text-sm text-gray-500 mb-1">
                                            Employee:{' '}
                                            <span className="font-medium text-gray-900">
                                              {item.employee_name ||
                                                item.employee_email ||
                                                'Unknown'}
                                            </span>
                                          </div>
                                          <div className="text-sm text-gray-500 mb-1">
                                            Idle time:{' '}
                                            <span className="font-medium text-gray-900">
                                              {item.idle_minutes} minutes
                                            </span>
                                          </div>
                                          <div className="text-sm text-gray-500 mb-1">
                                            Status:{' '}
                                            <span
                                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                item.status === 'pending'
                                                  ? 'bg-yellow-50 text-yellow-800'
                                                  : item.status === 'submitted'
                                                  ? 'bg-green-50 text-green-800'
                                                  : item.status === 'ticket_created'
                                                  ? 'bg-red-50 text-red-800'
                                                  : 'bg-gray-50 text-gray-800'
                                              }`}
                                            >
                                              {item.status}
                                            </span>
                                          </div>
                                          <div className="text-sm text-gray-500">
                                            Category:{' '}
                                            <span className="text-gray-900">
                                              {item.category || '-'}
                                            </span>{' '}
                                            · Subcategory:{' '}
                                            <span className="text-gray-900">
                                              {item.subcategory || '-'}
                                            </span>
                                          </div>
                                          <div className="text-sm text-gray-500 mt-1">
                                            Reason:{' '}
                                            <span className="text-gray-900">
                                              {item.reason_text || '—'}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="text-right text-sm text-gray-600">
                                          <div>
                                            {item.ticket_id
                                              ? `Ticket #${item.ticket_id}`
                                              : 'No ticket'}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Select a date to view your idle accountability records (over 20 minutes).
                  </div>
                  {onChangeAccountabilityDate && (
                    <div className="flex items-center space-x-2">
                      <label className="block text-xs font-medium text-gray-600">
                        Date
                      </label>
                      <input
                        type="date"
                        value={accountabilityDate || ''}
                        onChange={(e) => {
                          onChangeAccountabilityDate(e.target.value);
                          onRefreshAccountability?.({ date: e.target.value });
                        }}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      />
                    </div>
                  )}
                </div>
                {accountabilityError && (
                  <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
                    {accountabilityError}
                  </div>
                )}
                {accountabilityLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-500">
                    Loading your idle accountability records...
                  </div>
                ) : (
                  <>
                    {(() => {
                      const rows =
                        viewMode === 'pendingAccountability'
                          ? accountabilityPending
                          : accountabilityResolved;
                      if (!rows || rows.length === 0) {
                        return (
                          <div className="flex items-center justify-center py-12 text-gray-500 text-center">
                            {viewMode === 'pendingAccountability'
                              ? 'You have no pending idle accountability items for this date (over 20 minutes).'
                              : 'You have no resolved idle accountability items for this date.'}
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-4">
                          {rows.map((item) => (
                            <div
                              key={item.id}
                              className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm flex items-start justify-between"
                            >
                              <div>
                                <div className="text-sm text-gray-500 mb-1">
                                  Date:{' '}
                                  <span className="font-medium text-gray-900">
                                    {item.date}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-500 mb-1">
                                  Employee:{' '}
                                  <span className="font-medium text-gray-900">
                                    {item.employee_name || item.employee_email || 'You'}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-500 mb-1">
                                  Idle time:{' '}
                                  <span className="font-medium text-gray-900">
                                    {item.idle_minutes} minutes
                                  </span>
                                </div>
                                <div className="text-sm text-gray-500 mb-1">
                                  Status:{' '}
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      item.status === 'pending'
                                        ? 'bg-yellow-50 text-yellow-800'
                                        : item.status === 'submitted'
                                        ? 'bg-green-50 text-green-800'
                                        : item.status === 'ticket_created'
                                        ? 'bg-red-50 text-red-800'
                                        : 'bg-gray-50 text-gray-800'
                                    }`}
                                  >
                                    {item.status}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-500">
                                  Reason:{' '}
                                  <span className="text-gray-900">
                                    {item.reason_text || '—'}
                                  </span>
                                </div>
                                {item.ticket_id && (
                                  <div className="mt-1 text-xs text-gray-500">
                                    Ticket already created for this day (Ticket #
                                    {item.ticket_id})
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Tracking-app views (admins only) */}
        {isAdmin && (viewMode === 'range' || viewMode === 'current') && (
          <>
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
                    {filtered.length} employee{filtered.length !== 1 ? 's' : ''} {viewMode === 'current' ? 'currently idle' : 'above threshold'}
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
              {(viewMode === 'range' ? error : currentlyIdleError) && (
                <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
                  {viewMode === 'range' ? error : currentlyIdleError}
                </div>
              )}
              {(viewMode === 'range' ? loading : currentlyIdleLoading) ? (
                <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-center px-4">
                  <Clock className="w-16 h-16 text-gray-300 mb-4" />
                  {viewMode === 'current' ? (
                    <>
                      <p className="text-lg font-medium">No employees currently idle</p>
                      <p className="text-sm mb-2">No employees with at least {currentlyIdleMinMinutes} min idle in the last {currentlyIdleWindowMinutes} minutes.</p>
                      <p className="text-xs text-gray-400">Try a longer window (e.g. 30 min) or lower min idle, then click Refresh.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-medium">No employees above threshold</p>
                      <p className="text-sm mb-2">No employees with more than {minIdleHours}h {minIdleMinutes}m idle from {displayStart} to {displayEnd}.</p>
                      <p className="text-xs text-gray-400">Try lowering the minimum idle (e.g. 0h 30m) or pick a different date range. If the range is in the future, Team Logger may have no data yet.</p>
                    </>
                  )}
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
                  {viewMode === 'current'
                    ? `Showing ${filtered.length} of ${(currentlyIdleList || []).length} employees idle in last ${currentlyIdleWindowMinutes} min (≥${currentlyIdleMinMinutes} min)`
                    : `Showing ${filtered.length} of ${(lowIdleNotifications || []).length} employees with more than ${minIdleHours}h ${minIdleMinutes}m idle`}
                </span>
                <span>
                  {viewMode === 'current' ? `Window: last ${currentlyIdleWindowMinutes} min` : `Range: ${displayStart} – ${displayEnd}`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LowIdleNotificationPanel;
