import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronLeft, ChevronRight, Lock, Unlock, RefreshCw } from 'lucide-react';

const CELL_COLORS = {
  holiday: 'bg-sky-200',
  important: 'bg-amber-500',   // orange/amber for important (no leave) – distinct from rejected
  rejected: 'bg-red-500',      // red for rejected leaves
  awol: 'bg-purple-400',
  full_day: 'bg-green-300',
  first_half: 'bg-yellow-300',
  second_half: 'bg-green-600',
};

function getCellStyle(leave, dateStr) {
  if (!leave) return '';
  const d = dateStr;
  const start = leave.start_date && typeof leave.start_date === 'string' ? leave.start_date.slice(0, 10) : leave.start_date;
  const end = leave.end_date && typeof leave.end_date === 'string' ? leave.end_date.slice(0, 10) : leave.end_date;
  if (start > d || end < d) return '';
  if (leave.status === 'rejected') return CELL_COLORS.rejected;
  if (leave.is_uninformed) return CELL_COLORS.awol;
  const startSeg = leave.start_segment || 'full_day';
  const endSeg = leave.end_segment || 'full_day';
  const fullDay = startSeg === 'full_day' || endSeg === 'full_day';
  if (fullDay) return CELL_COLORS.full_day;
  if (startSeg === 'shift_start' || startSeg === 'shift_middle') return CELL_COLORS.first_half;
  return CELL_COLORS.second_half;
}

function getDaysInMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const days = [];
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(String(year) + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
  }
  return days;
}

// Normalize API date (may be "YYYY-MM-DD" or ISO string) to YYYY-MM-DD for comparison
function toDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  } catch {
    return String(val).slice(0, 10);
  }
}

export default function LeavesCalendar() {
  const { user } = useAuth();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [data, setData] = useState({ employees: [], leaves: [], blockedDates: [], importantDates: [], holidayDates: [] });
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [importantDepartmentId, setImportantDepartmentId] = useState(''); // '' or number = which dept for "important" (empty = all)
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkType, setBulkType] = useState('important');
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [bulkLabel, setBulkLabel] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'Admin';

  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const loadCalendar = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true);
    fetch(`/api/leaves/calendar?start=${start}&end=${end}`)
      .then((res) => res.ok ? res.json() : { employees: [], leaves: [], blockedDates: [], importantDates: [], holidayDates: [] })
      .then(setData)
      .catch(() => setData({ employees: [], leaves: [], blockedDates: [], importantDates: [], holidayDates: [] }))
      .finally(() => { if (showLoading) setLoading(false); });
  }, [start, end]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaves/calendar?start=${start}&end=${end}`)
      .then((res) => res.ok ? res.json() : { employees: [], leaves: [], blockedDates: [], importantDates: [], holidayDates: [] })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ employees: [], leaves: [], blockedDates: [], importantDates: [], holidayDates: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [start, end]);

  // Refetch when user returns to the tab/window so calendar shows latest after apply or acknowledge
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadCalendar();
    };
    const onFocus = () => loadCalendar();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadCalendar]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/departments')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        const byId = new Map();
        arr.forEach((d) => {
          if (d && d.id != null && !byId.has(Number(d.id))) byId.set(Number(d.id), d);
        });
        setDepartments(Array.from(byId.values()));
      })
      .catch(() => setDepartments([]));
  }, [isAdmin]);

  const days = getDaysInMonth(year, month);
  const blockedDates = data.blockedDates || [];
  const allImportantEntries = (data.importantDates || []).concat(
    (blockedDates || []).filter((b) => b.type === 'important')
  );
  const importantSet = new Set(allImportantEntries.map((b) => toDateStr(b.date)).filter(Boolean));
  const holidaySet = new Set(
    (data.holidayDates || []).map((b) => toDateStr(b.date)).filter(Boolean).concat(
      (blockedDates || []).filter((b) => b.type === 'holiday').map((b) => toDateStr(b.date)).filter(Boolean)
    )
  );
  const isSunday = (dateStr) => new Date(dateStr + 'T12:00:00').getDay() === 0;
  const isDateImportantForEmployee = (dateStr, emp) =>
    allImportantEntries.some(
      (b) => toDateStr(b.date) === dateStr && (b.department_id == null || Number(b.department_id) === Number(emp.department_id))
    );

  const markDate = async (date, type = 'important') => {
    if (!isAdmin) return;
    try {
      const body = { date, type };
      if (type === 'important' && importantDepartmentId !== '') body.department_id = Number(importantDepartmentId) || null;
      const res = await fetch('/api/leaves/blocked-dates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || 'employee',
        },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) loadCalendar();
    } catch (e) {
      console.error(e);
    }
  };

  const unmarkDate = async (date, type) => {
    if (!isAdmin) return;
    try {
      const url = type ? `/api/leaves/blocked-dates/${date}?type=${type}` : `/api/leaves/blocked-dates/${date}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'x-user-role': user?.role || 'employee' },
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) loadCalendar();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkMark = async () => {
    if (!isAdmin || (!bulkFrom && !bulkTo)) return;
    const from = bulkFrom || bulkTo;
    const to = bulkTo || bulkFrom;
    if (!from || !to) return;
    const fromD = new Date(from);
    const toD = new Date(to);
    if (fromD > toD) return;
    const dates = [];
    for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    setBulkSubmitting(true);
    try {
      const body = { dates, type: bulkType, label: bulkLabel || undefined };
      if (bulkType === 'important' && bulkDepartmentId !== '') body.department_id = Number(bulkDepartmentId) || null;
      const res = await fetch('/api/leaves/blocked-dates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || 'employee',
        },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.success) {
        setBulkFrom('');
        setBulkTo('');
        setBulkLabel('');
        loadCalendar();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-500">Loading calendar...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Leave Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadCalendar(true)}
            className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 flex items-center gap-1.5 text-sm text-gray-700"
            aria-label="Refresh calendar"
            title="Refresh to see latest leaves"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="min-w-[180px] text-center font-medium text-gray-900">{monthName}</span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 p-4 bg-white border rounded-lg shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Legend</h2>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.holiday}`} />
            <span className="text-sm text-gray-700">Holiday</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.important}`} />
            <span className="text-sm text-gray-700">Important (no leave)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.rejected}`} />
            <span className="text-sm text-gray-700">Rejected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.awol}`} />
            <span className="text-sm text-gray-700">AWOL / Absent</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.full_day}`} />
            <span className="text-sm text-gray-700">Full-day</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.first_half}`} />
            <span className="text-sm text-gray-700">1st-half</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.second_half}`} />
            <span className="text-sm text-gray-700">2nd-half</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Sundays are always treated as holidays.</p>
      </div>

      {isAdmin && (
        <div className="mb-4 p-4 bg-white border rounded-lg shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Mark dates (admin)</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">From</label>
              <input
                type="date"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">To</label>
              <input
                type="date"
                value={bulkTo}
                onChange={(e) => setBulkTo(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Mark as</label>
              <select
                value={bulkType}
                onChange={(e) => setBulkType(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              >
                <option value="important">Important (no leave)</option>
                <option value="holiday">Holiday</option>
              </select>
            </div>
            {bulkType === 'important' && (
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">For department</label>
                <select
                  value={bulkDepartmentId}
                  onChange={(e) => setBulkDepartmentId(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm min-w-[140px]"
                >
                  <option value="">All departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Label (optional)</label>
              <input
                type="text"
                value={bulkLabel}
                onChange={(e) => setBulkLabel(e.target.value)}
                placeholder="e.g. Company event"
                className="border rounded px-2 py-1.5 text-sm w-36"
              />
            </div>
            <button
              type="button"
              onClick={handleBulkMark}
              disabled={bulkSubmitting || (!bulkFrom && !bulkTo)}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {bulkSubmitting ? 'Applying...' : 'Apply'}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>When marking Important, apply to department:</span>
            <select
              value={importantDepartmentId}
              onChange={(e) => setImportantDepartmentId(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">All departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
            <span>— then click lock on a date. Unlock removes all important for that date.</span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] bg-white border rounded-lg shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-10 min-w-[140px] px-3 py-2 text-left font-medium text-gray-700 bg-gray-50 border-r border-gray-200">
                Employee
              </th>
              {days.map((d) => {
                const isImportant = importantSet.has(d);
                const isHoliday = holidaySet.has(d) || isSunday(d);
                const headerBg = isImportant ? 'bg-amber-500 text-white' : isHoliday ? 'bg-sky-200 text-gray-800' : 'text-gray-700';
                const isMarked = isImportant || holidaySet.has(d);
                return (
                  <th
                    key={d}
                    className={`sticky top-0 z-10 px-1 py-2 text-center font-medium w-8 ${headerBg}`}
                    title={isImportant ? 'Important (no leave)' : isHoliday ? 'Holiday' : ''}
                  >
                    <div className="flex flex-col items-center">
                      <span>{new Date(d + 'T12:00:00').getDate()}</span>
                      {isAdmin && (
                        <span className="mt-1">
                          {isMarked ? (
                            <button
                              type="button"
                              onClick={() => unmarkDate(d, isImportant ? 'important' : 'holiday')}
                              className="p-0.5 rounded hover:bg-black/10"
                              title="Unmark"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markDate(d, 'important')}
                              className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
                              title="Mark as important (no leave)"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(data.employees || []).map((emp) => {
              const empLeaves = (data.leaves || []).filter((l) => l.employee_id === emp.id);
              return (
                <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 px-3 py-1.5 font-medium text-gray-800 bg-white border-r border-gray-200" title={emp.department ? `Dept: ${emp.department}` : ''}>
                    {emp.name}
                    {emp.department && <span className="block text-xs font-normal text-gray-500">{emp.department}</span>}
                  </td>
                  {days.map((dateStr) => {
                    const leave = empLeaves.find(
                      (l) => toDateStr(l.start_date) <= dateStr && toDateStr(l.end_date) >= dateStr
                    );
                    let style = getCellStyle(leave, dateStr);
                    if (!style) {
                      if (isDateImportantForEmployee(dateStr, emp)) style = CELL_COLORS.important;
                      else if (holidaySet.has(dateStr) || isSunday(dateStr)) style = CELL_COLORS.holiday;
                      else style = 'bg-gray-50';
                    }
                    return (
                      <td
                        key={dateStr}
                        className={`w-8 h-8 p-0 align-middle ${style}`}
                        title={
                          leave
                            ? `${leave.status} ${leave.start_segment || ''}-${leave.end_segment || ''}`
                            : isDateImportantForEmployee(dateStr, emp)
                            ? 'Important (no leave)'
                            : holidaySet.has(dateStr) || isSunday(dateStr)
                            ? 'Holiday'
                            : ''
                        }
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
