import React, { useMemo } from 'react';
import { AlertTriangle, X, Filter, Search, Calendar, Users, Clock as ClockIcon, ChevronDown, ChevronRight, Building } from 'lucide-react';

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

  // Build unique designations and departments from current notifications (for dropdowns/grouping)
  const { uniqueDesignations, groupedByDepartment } = useMemo(() => {
    const designationsSet = new Set();
    const groups = {};
    (notifications || []).forEach((n) => {
      if (n.designation) designationsSet.add(n.designation);
      const dept = n.department || 'Unassigned';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(n);
    });
    return {
      uniqueDesignations: Array.from(designationsSet).sort(),
      groupedByDepartment: groups,
    };
  }, [notifications]);

  const handleApplyFilters = (e) => {
    e.preventDefault();
    const form = e.target.form || e.currentTarget.form || e.currentTarget;
    const start = form.start?.value || startDate;
    const end = form.end?.value || endDate;
    const desig = form.designation?.value || '';
    const minOver = parseInt(form.minOver?.value, 10) || minOverMinutes;
    onUpdateFilters({ start, end, designation: desig, minOver });
  };

  if (!isOpen) return null;

  const totalCount = notifications?.length || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Tasks Over Estimate</h2>
              <p className="text-sm text-gray-600">
                Showing tasks where actual logged time exceeded the estimate by at least {minOverMinutes} minutes.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-200">
          <form className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
            <div className="md:col-span-4 flex justify-between items-center mt-2">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Search className="w-4 h-4" />
                <span>{totalCount} record(s) found</span>
              </div>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span>Apply Filters</span>
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
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center space-x-2">
                      <Building className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-semibold text-gray-800">
                        {dept} ({deptItems.length})
                      </span>
                    </div>
                  </div>
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

