import React, { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, X, Filter, Search, Calendar, Users, Clock as ClockIcon, ChevronDown, ChevronRight, Building, Settings } from 'lucide-react';

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
  const [localStart, localEnd, localDesignation, localMinOver] = useMemo(
    () => [startDate, endDate, designation || '', minOverMinutes],
    [startDate, endDate, designation, minOverMinutes]
  );

  // Local filters similar to LTE/LHE
  const [filters, setFilters] = useState({
    searchTerm: '',
    department: '',
    designationFilter: ''
  });

  const [showSettings, setShowSettings] = useState(false);
  const [tempMinOver, setTempMinOver] = useState(minOverMinutes);
  const [tempSelectedDate, setTempSelectedDate] = useState(startDate);
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());

  // Keep temporary settings in sync when opening settings panel
  useEffect(() => {
    if (showSettings) {
      setTempMinOver(minOverMinutes);
      setTempSelectedDate(startDate);
    }
  }, [showSettings, minOverMinutes, startDate]);

  // Build unique filter values and apply filters, then group by department
  const { uniqueDesignations, uniqueDepartments, groupedByDepartment } = useMemo(() => {
    const designationsSet = new Set();
    const departmentsSet = new Set();
    const source = notifications || [];

    // Collect uniques
    source.forEach((n) => {
      if (n.designation) designationsSet.add(n.designation);
      if (n.department) departmentsSet.add(n.department);
    });

    // Apply local filters
    const filtered = source.filter((n) => {
      if (filters.searchTerm && !(n.task_title || '').toLowerCase().includes(filters.searchTerm.toLowerCase())) {
        return false;
      }
      if (filters.department && (n.department || '') !== filters.department) {
        return false;
      }
      if (filters.designationFilter && (n.designation || '') !== filters.designationFilter) {
        return false;
      }
      return true;
    });

    // Group by department
    const groups = {};
    filtered.forEach((n) => {
      const dept = n.department || 'Unassigned';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(n);
    });

    return {
      uniqueDesignations: Array.from(designationsSet).sort(),
      uniqueDepartments: Array.from(departmentsSet).sort(),
      uniquePriorities: Array.from(prioritiesSet).sort(),
      groupedByDepartment: groups,
    };
  }, [notifications, filters]);

  const handleDepartmentToggle = (dept) => {
    const next = new Set(expandedDepartments);
    if (next.has(dept)) next.delete(dept);
    else next.add(dept);
    setExpandedDepartments(next);
  };

  const handleApplyFilters = (e) => {
    e.preventDefault();
    const form = e.target.form || e.currentTarget.form || e.currentTarget;
    const start = form.start?.value || startDate;
    const end = form.end?.value || endDate;
    const desig = form.designation?.value || '';
    const minOver = parseInt(form.minOver?.value, 10) || minOverMinutes;
    onUpdateFilters({ start, end, designation: desig, minOver });
  };

  const handleSettingsUpdate = () => {
    if (tempMinOver < 0) return;
    const date = tempSelectedDate || startDate;
    onUpdateFilters({
      start: date,
      end: date,
      designation,
      minOver: tempMinOver
    });
    setShowSettings(false);
  };

  if (!isOpen) return null;

  const totalCount = Object.values(groupedByDepartment).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Tasks Over Estimate Notifications</h2>
              <p className="text-sm text-gray-600">
                Tasks where logged time exceeded estimate by at least {minOverMinutes} minutes on {startDate}.
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

        {/* Settings (min overrun + date) */}
        {showSettings && (
          <div className="p-4 bg-amber-50 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Minimum Overrun (minutes):</label>
                <input
                  type="number"
                  min="0"
                  value={tempMinOver}
                  onChange={(e) => setTempMinOver(parseInt(e.target.value, 10) || 0)}
                  className="w-24 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Date:</label>
                <input
                  type="date"
                  value={tempSelectedDate}
                  onChange={(e) => setTempSelectedDate(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={handleSettingsUpdate}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                Update
              </button>
              <button
                onClick={() => {
                  setTempMinOver(minOverMinutes);
                  setTempSelectedDate(startDate);
                  setShowSettings(false);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filters (search + department/designation) */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Search Task */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 w-64"
                />
              </div>

              {/* Department Filter */}
              <select
                value={filters.department}
                onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">All Departments</option>
                {uniqueDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>

              {/* Designation Filter */}
              <select
                value={filters.designationFilter}
                onChange={(e) => setFilters(prev => ({ ...prev, designationFilter: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">All Designations</option>
                {uniqueDesignations.map(des => (
                  <option key={des} value={des}>{des}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Filter className="w-4 h-4" />
              <span>{totalCount} task{totalCount !== 1 ? 's' : ''} over estimate</span>
            </div>
          </div>
        </div>
            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="date"
                  name="start"
                  defaultValue={localStart}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="date"
                  name="end"
                  defaultValue={localEnd}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Designation (backend filter) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select
                  name="designation"
                  defaultValue={localDesignation}
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

            {/* Min Overrun */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Overrun (minutes)</label>
              <div className="relative">
                <ClockIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="number"
                  name="minOver"
                  min="0"
                  defaultValue={localMinOver}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
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

            {/* Apply button */}
            <div className="md:col-span-4 flex justify-end mt-2">
              <button
                type="button"
                onClick={handleApplyFilters}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span>Apply Date & Threshold</span>
              </button>
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
            <div className="p-4 space-y-6">
              {Object.entries(groupedByDepartment).map(([dept, deptItems]) => (
                <div key={dept} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleDepartmentToggle(dept)}
                    className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200"
                  >
                    <div className="flex items-center space-x-2">
                      <ChevronRight
                        className={`w-4 h-4 text-gray-500 transition-transform ${expandedDepartments.has(dept) ? 'transform rotate-90' : ''}`}
                      />
                      <Building className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-800">
                        {dept} ({deptItems.length})
                      </span>
                    </div>
                  </button>
                  {expandedDepartments.has(dept) && (
                  <div className="overflow-x-auto">
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

