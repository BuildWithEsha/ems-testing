import React, { useMemo, useState } from 'react';
import { AlertTriangle, X, Filter, Search, Calendar, Users, Clock as ClockIcon, ChevronDown, ChevronRight, Building, Settings, Ticket } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const formatHMS = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

const OverEstimateTaskNotificationPanel = ({
  isOpen,
  onClose,
  notifications,
  startDate,
  endDate,
  designation,
  minOverMinutes,
  onUpdateFilters,
  loading,
  error
}) => {
  const { user } = useAuth();

  const [localStart, localEnd, localDesignation, localMinOver] = useMemo(
    () => [startDate, endDate, designation || '', minOverMinutes],
    [startDate, endDate, designation, minOverMinutes]
  );

  // Settings (like LHE/LTE) for min overrun and date range
  const [showSettings, setShowSettings] = useState(false);
  const [tempMinOver, setTempMinOver] = useState(localMinOver);
  const [tempStartDate, setTempStartDate] = useState(localStart);
  const [tempEndDate, setTempEndDate] = useState(localEnd);

  const handleSettingsUpdate = () => {
    const minOver = Number.isFinite(Number(tempMinOver)) ? Number(tempMinOver) : minOverMinutes;
    const start = tempStartDate || startDate;
    const end = tempEndDate || endDate;
    onUpdateFilters({ start, end, designation: localDesignation, minOver });
    setShowSettings(false);
  };

  // Local filters (same as LTE/LHE: search, department, priority)
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    priority: ''
  });

  const [showFilters, setShowFilters] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [creatingTickets, setCreatingTickets] = useState(false);

  const isManagerByDesignation = user?.designation && String(user.designation).toLowerCase().includes('manager');
  const canCreateOverEstTickets = !!user && (
    user.role === 'admin' ||
    user.role === 'Admin' ||
    user?.is_manager ||
    (user?.role && String(user.role).toLowerCase() === 'manager') ||
    isManagerByDesignation ||
    user.permissions?.includes('all') ||
    user.permissions?.includes('tickets_auto_less_hours')
  );

  const handleCreateOverEstTickets = async () => {
    if (!canCreateOverEstTickets) return;
    const taskCount = Object.values(groupedByDepartment).reduce((sum, arr) => sum + arr.length, 0);
    if (taskCount === 0) {
      alert('No tasks over estimate to create tickets for.');
      return;
    }
    const confirmMessage = `Create "Task overestimated" tickets for ${taskCount} task(s) in the selected date range?`;
    if (!window.confirm(confirmMessage)) return;
    setCreatingTickets(true);
    try {
      const response = await fetch('/api/tickets/auto-over-estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || 'admin',
          'user-permissions': JSON.stringify(user?.permissions || ['all']),
          'user-id': String(user?.id || ''),
          ...(user?.designation != null && user.designation !== '' ? { 'x-user-designation': String(user.designation) } : {})
        },
        body: JSON.stringify({
          startDate: startDate || localStart,
          endDate: endDate || localEnd,
          minOverMinutes: minOverMinutes ?? localMinOver,
          designation: (designation || localDesignation) || undefined
        })
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to auto-create over-estimate tickets');
      }
      const result = await response.json();
      alert(`Created ${result.ticketsCreated || 0} "Task overestimated" ticket(s) for the selected range.`);
    } catch (err) {
      console.error('Error auto-creating over-estimate tickets:', err);
      alert(err.message || 'Failed to auto-create over-estimate tickets');
    } finally {
      setCreatingTickets(false);
    }
  };

  const handleDepartmentToggle = (dept) => {
    setExpandedDepartments(prev => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // Build unique filter values and apply filters, then group by department
  const { uniqueDesignations, uniqueDepartments, uniquePriorities, groupedByDepartment } = useMemo(() => {
    const designationsSet = new Set();
    const departmentsSet = new Set();
    const prioritiesSet = new Set();
    const source = notifications || [];

    // Collect uniques
    source.forEach((n) => {
      if (n.designation) designationsSet.add(n.designation);
      if (n.department) departmentsSet.add(n.department);
      if (n.priority) prioritiesSet.add(n.priority);
    });

    const filtered = source.filter((n) => {
      if (filters.searchTerm && !(n.task_title || '').toLowerCase().includes(filters.searchTerm.toLowerCase())) {
        return false;
      }
      const nDept = n.department || 'Unassigned';
      if (filters.department && nDept !== filters.department) {
        return false;
      }
      if (filters.priority && (n.priority || '') !== filters.priority) {
        return false;
      }
      return true;
    });

    const groups = {};
    filtered.forEach((n) => {
      const dept = n.department || 'Unassigned';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(n);
    });

    const sortedDepartmentEntries = Object.entries(groups).sort((a, b) => {
      if (a[0] === 'Unassigned') return 1;
      if (b[0] === 'Unassigned') return -1;
      return (a[0] || '').localeCompare(b[0] || '', undefined, { sensitivity: 'base' });
    });
    const groupedByDepartmentSorted = Object.fromEntries(sortedDepartmentEntries);

    return {
      uniqueDesignations: Array.from(designationsSet).sort(),
      uniqueDepartments: Array.from(departmentsSet).sort(),
      uniquePriorities: Array.from(prioritiesSet).sort(),
      groupedByDepartment: groupedByDepartmentSorted,
    };
  }, [notifications, filters]);

  if (!isOpen) return null;

  const totalCount = Object.values(groupedByDepartment).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header (modeled after LHE/LTE) */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Tasks Over Estimate Notifications</h2>
              <p className="text-sm text-gray-600">
                Tasks where actual logged time exceeded the estimate by at least {minOverMinutes} minutes
                {startDate && endDate ? ` between ${startDate} and ${endDate}` : ''}.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
              title="Configure over-estimate settings"
            >
              <Settings className="w-4 h-4" />
              <span>{minOverMinutes} min</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Settings (threshold + date range, similar to LHE settings) */}
        {showSettings && (
          <div className="p-4 bg-amber-50 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Min Overrun (minutes):</label>
                <input
                  type="number"
                  min="0"
                  value={tempMinOver}
                  onChange={(e) => setTempMinOver(parseInt(e.target.value, 10) || 0)}
                  className="w-24 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Start Date:</label>
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">End Date:</label>
                <input
                  type="date"
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                type="button"
                onClick={handleSettingsUpdate}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                Update
              </button>
              <button
                type="button"
                onClick={() => {
                  setTempMinOver(minOverMinutes);
                  setTempStartDate(startDate);
                  setTempEndDate(endDate);
                  setShowSettings(false);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filters & summary (similar structure to LHE filters) */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Filter className="w-4 h-4" />
              <span>{totalCount} task{totalCount !== 1 ? 's' : ''} over estimate</span>
            </div>
            {canCreateOverEstTickets && totalCount > 0 && (
              <button
                type="button"
                onClick={handleCreateOverEstTickets}
                disabled={creatingTickets}
                className="flex items-center space-x-2 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                title="Create tickets for tasks over estimate"
              >
                <Ticket className="w-4 h-4" />
                <span>{creatingTickets ? 'Creating...' : 'Create tickets'}</span>
              </button>
            )}
          </div>

          <form className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            {/* Designation (backend filter) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select
                  name="designation"
                  value={localDesignation}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateFilters({
                      start: startDate,
                      end: endDate,
                      designation: val,
                      minOver: minOverMinutes
                    });
                  }}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">All</option>
                  {uniqueDesignations.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Search Task */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Task</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  placeholder="Search by task title..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={filters.department}
                onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">All Departments</option>
                {uniqueDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">All Priorities</option>
                {uniquePriorities.map(priority => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
          </form>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-6 text-sm text-gray-600">Loading over-estimate tasks...</div>
          )}
          {error && !loading && (
            <div className="p-6 text-sm text-red-600">Error: {error}</div>
          )}
          {!loading && !error && totalCount === 0 && (
            <div className="p-6 text-sm text-gray-600">No tasks over estimate found for the selected filters.</div>
          )}
          {!loading && !error && totalCount > 0 && (
            <div className="p-6 space-y-4">
              {Object.entries(groupedByDepartment).map(([dept, deptItems]) => (
                <div key={dept} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Department header with expand/collapse, similar to LHE/LTE */}
                  <button
                    onClick={() => handleDepartmentToggle(dept)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      {expandedDepartments.has(dept) ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                      <Building className="w-5 h-5 text-gray-500" />
                      <span className="font-medium text-gray-900">{dept}</span>
                      <span className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-full">
                        {deptItems.length} task{deptItems.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>

                  {expandedDepartments.has(dept) && (
                    <div className="overflow-x-auto border-t border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Designation</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estimate</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Overrun</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {deptItems.map((n, idx) => {
                            const estimateMinutes = Math.round((n.estimate_seconds || 0) / 60);
                            const overrunMinutes = Math.round((n.overrun_seconds || 0) / 60);
                            return (
                              <tr key={`${n.task_id}-${n.employee_name}-${n.log_date}-${idx}`} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  {n.log_date}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  <div className="font-medium text-gray-900">{n.task_title || `Task #${n.task_id}`}</div>
                                  {n.labels && (
                                    <div className="text-xs text-gray-500 truncate max-w-xs">
                                      {n.labels}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">{n.employee_name || '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{n.designation || '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  <div>{formatHMS(n.estimate_seconds)}</div>
                                  <div className="text-xs text-gray-500">{estimateMinutes} min</div>
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  <div>{formatHMS(n.actual_seconds)}</div>
                                  <div className="text-xs text-gray-500">{Math.round((n.actual_seconds || 0) / 60)} min</div>
                                </td>
                                <td className="px-4 py-2 text-sm text-amber-700">
                                  <div>{formatHMS(n.overrun_seconds)}</div>
                                  <div className="text-xs">{overrunMinutes} min</div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OverEstimateTaskNotificationPanel;

