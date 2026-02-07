import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronLeft, ChevronRight, Lock, Unlock, RefreshCw, Filter } from 'lucide-react';

const CELL_COLORS = {
  holiday: 'bg-sky-200',
  important: 'bg-amber-500',   // base color for Important (no leave)
  rejected: 'bg-red-500',      // red for rejected leaves
  awol: 'bg-purple-400',
  full_day: 'bg-green-300',
  first_half: 'bg-yellow-300',
  second_half: 'bg-green-600',
};

// Palette for department-specific Important colors (per-department tint)
const DEPT_IMPORTANT_COLORS = [
  'bg-amber-500',
  'bg-emerald-400',
  'bg-indigo-400',
  'bg-rose-400',
  'bg-sky-400',
  'bg-lime-400',
];

function getDeptImportantColor(departmentId) {
  if (departmentId == null || departmentId === '') return CELL_COLORS.important;
  const n = Number(departmentId);
  if (!Number.isFinite(n)) return CELL_COLORS.important;
  const idx = Math.abs(n) % DEPT_IMPORTANT_COLORS.length;
  return DEPT_IMPORTANT_COLORS[idx];
}

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

function getLeaveSegmentLabel(leave) {
  if (!leave) return '';
  if (leave.status === 'rejected') return 'Rejected';
  if (leave.is_uninformed) return 'Absent';
  const startSeg = leave.start_segment || 'full_day';
  const endSeg = leave.end_segment || 'full_day';
  const fullDay = startSeg === 'full_day' || endSeg === 'full_day';
  if (fullDay) return 'Full day';
  if (startSeg === 'shift_start' || startSeg === 'shift_middle') return '1st half';
  return '2nd half';
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
  // Mark: single date, optional day-of-week (mark all that day in current month), single department, type, label
  const [markDate, setMarkDate] = useState('');
  const [markDayOfWeek, setMarkDayOfWeek] = useState(''); // '' or '0'-'6'
  const [markType, setMarkType] = useState('important');
  const [markLabel, setMarkLabel] = useState('');
  const [markSubmitting, setMarkSubmitting] = useState(false);
  const [markDepartmentId, setMarkDepartmentId] = useState(''); // '' = all departments
  // Unmark: optional date, optional day-of-week, single department, type, label
  const [unmarkDate, setUnmarkDate] = useState('');
  const [unmarkDayOfWeek, setUnmarkDayOfWeek] = useState('');
  const [unmarkLabel, setUnmarkLabel] = useState('');
  const [unmarkType, setUnmarkType] = useState('important');
  const [unmarkSubmitting, setUnmarkSubmitting] = useState(false);
  const [unmarkDepartmentId, setUnmarkDepartmentId] = useState('');
  const [filterEmployeeName, setFilterEmployeeName] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');
  const isAdmin = user?.role === 'admin' || user?.role === 'Admin';

  const DAY_OPTIONS = [
    { value: '0', label: 'Sunday' },
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
  ];

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

  // Filter options derived from calendar data (works for both admin and employees)
  const departmentOptions = useMemo(() => {
    const map = new Map();
    (data.employees || []).forEach((e) => {
      if (e.department_id != null && e.department && !map.has(e.department_id)) {
        map.set(e.department_id, { id: e.department_id, name: e.department });
      }
    });
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(b.name));
  }, [data.employees]);

  const designationOptions = useMemo(() => {
    const set = new Set();
    (data.employees || []).forEach((e) => {
      if (e.designation && String(e.designation).trim()) set.add(String(e.designation).trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.employees]);

  const filteredEmployees = useMemo(() => {
    let list = data.employees || [];
    if (filterEmployeeName.trim()) {
      const q = filterEmployeeName.toLowerCase().trim();
      list = list.filter((e) => (e.name || '').toLowerCase().includes(q));
    }
    if (filterDepartmentId !== '') {
      list = list.filter((e) => String(e.department_id) === String(filterDepartmentId));
    }
    if (filterDesignation !== '') {
      list = list.filter(
        (e) => String(e.designation || '').trim().toLowerCase() === filterDesignation.trim().toLowerCase()
      );
    }
    return list;
  }, [data.employees, filterEmployeeName, filterDepartmentId, filterDesignation]);
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

  const getImportantLabelsForDate = (dateStr) => {
    const labels = allImportantEntries
      .filter((b) => toDateStr(b.date) === dateStr && b.label)
      .map((b) => String(b.label).trim())
      .filter(Boolean);
    return Array.from(new Set(labels));
  };

  const getImportantLabelsForEmployeeOnDate = (dateStr, emp) => {
    const labels = allImportantEntries
      .filter(
        (b) =>
          toDateStr(b.date) === dateStr &&
          (b.department_id == null || Number(b.department_id) === Number(emp.department_id)) &&
          b.label
      )
      .map((b) => String(b.label).trim())
      .filter(Boolean);
    return Array.from(new Set(labels));
  };

  const getHolidayLabelsForDate = (dateStr) => {
    const fromHoliday = (data.holidayDates || []).filter((b) => toDateStr(b.date) === dateStr && b.label).map((b) => String(b.label).trim()).filter(Boolean);
    const fromBlocked = (blockedDates || []).filter((b) => b.type === 'holiday' && toDateStr(b.date) === dateStr && b.label).map((b) => String(b.label).trim()).filter(Boolean);
    return Array.from(new Set([...fromHoliday, ...fromBlocked]));
  };

  const markDateAsBlocked = async (date, type = 'important') => {
    if (!isAdmin) return;
    try {
      const body = { date, type };
      if (type === 'important' && markDepartmentId) body.department_id = Number(markDepartmentId) || null;
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

  const unmarkDateBlocked = async (date, type, label) => {
    if (!isAdmin) return;
    try {
      let url = type ? `/api/leaves/blocked-dates/${date}?type=${type}` : `/api/leaves/blocked-dates/${date}`;
      if (label && String(label).trim()) url += (url.includes('?') ? '&' : '?') + `label=${encodeURIComponent(String(label).trim())}`;
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

  // Get all dates in current calendar month that fall on a given day of week (0-6).
  const getDatesInMonthForDayOfWeek = (dayOfWeek) => {
    const dayNum = Number(dayOfWeek);
    if (!Number.isFinite(dayNum) || dayNum < 0 || dayNum > 6) return [];
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const dates = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === dayNum) dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  };

  // Mark: (1) If only Day is set: mark all dates in current month that fall on that day. (2) If Date is set: mark that date.
  const handleMark = async () => {
    if (!isAdmin) return;
    const dayNum = markDayOfWeek !== '' && markDayOfWeek !== undefined ? Number(markDayOfWeek) : null;
    const hasDayOnly = Number.isFinite(dayNum) && dayNum >= 0 && dayNum <= 6 && (!markDate || !String(markDate).match(/^\d{4}-\d{2}-\d{2}$/));
    const hasDate = markDate && String(markDate).match(/^\d{4}-\d{2}-\d{2}$/);

    if (hasDayOnly) {
      const dates = getDatesInMonthForDayOfWeek(dayNum);
      if (dates.length === 0) return;
      setMarkSubmitting(true);
      try {
        const body = { dates, type: markType, label: markLabel || undefined };
        if (markType === 'important') body.department_id = markDepartmentId ? Number(markDepartmentId) : null;
        const res = await fetch('/api/leaves/blocked-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-role': user?.role || 'employee' },
          body: JSON.stringify(body),
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success) {
          setMarkDayOfWeek('');
          setMarkLabel('');
          loadCalendar();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setMarkSubmitting(false);
      }
      return;
    }
    if (!hasDate) return;
    setMarkSubmitting(true);
    try {
      const body = { date: markDate, dates: [markDate], type: markType, label: markLabel || undefined };
      if (markType === 'important') body.department_id = markDepartmentId ? Number(markDepartmentId) : null;
      const res = await fetch('/api/leaves/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': user?.role || 'employee' },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.success) {
        setMarkDate('');
        setMarkLabel('');
        loadCalendar();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMarkSubmitting(false);
    }
  };

  // Unmark: (1) If only Day is set: unmark all dates in current month that fall on that day. (2) If Date is set: unmark that date.
  const handleUnmark = async () => {
    if (!isAdmin) return;
    const dayNum = unmarkDayOfWeek !== '' && unmarkDayOfWeek !== undefined ? Number(unmarkDayOfWeek) : null;
    const hasDayOnly = Number.isFinite(dayNum) && dayNum >= 0 && dayNum <= 6 && (!unmarkDate || !String(unmarkDate).match(/^\d{4}-\d{2}-\d{2}$/));
    const hasDate = unmarkDate && String(unmarkDate).match(/^\d{4}-\d{2}-\d{2}$/);

    if (hasDayOnly) {
      const dates = getDatesInMonthForDayOfWeek(dayNum);
      if (dates.length === 0) return;
      setUnmarkSubmitting(true);
      try {
        let anySuccess = false;
        for (const date of dates) {
          let url = `/api/leaves/blocked-dates/${date}?type=${unmarkType}`;
          if (unmarkType === 'important' && unmarkDepartmentId) url += `&department_id=${encodeURIComponent(unmarkDepartmentId)}`;
          if (unmarkLabel && String(unmarkLabel).trim()) url += `&label=${encodeURIComponent(String(unmarkLabel).trim())}`;
          const res = await fetch(url, { method: 'DELETE', headers: { 'x-user-role': user?.role || 'admin' } });
          const result = await res.json().catch(() => ({}));
          if (res.ok && result.success) anySuccess = true;
        }
        if (anySuccess) {
          setUnmarkDayOfWeek('');
          setUnmarkLabel('');
          loadCalendar();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setUnmarkSubmitting(false);
      }
      return;
    }
    if (!hasDate) return;
    setUnmarkSubmitting(true);
    try {
      let url = `/api/leaves/blocked-dates/${unmarkDate}?type=${unmarkType}`;
      if (unmarkType === 'important' && unmarkDepartmentId) url += `&department_id=${encodeURIComponent(unmarkDepartmentId)}`;
      if (unmarkLabel && String(unmarkLabel).trim()) url += `&label=${encodeURIComponent(String(unmarkLabel).trim())}`;
      const res = await fetch(url, { method: 'DELETE', headers: { 'x-user-role': user?.role || 'admin' } });
      const result = await res.json().catch(() => ({}));
      if (res.ok && result.success) {
        setUnmarkDate('');
        setUnmarkLabel('');
        loadCalendar();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUnmarkSubmitting(false);
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

      {/* Filters: employee name, department, designation (for both admin and employees) */}
      <div className="mb-4 p-4 bg-white border rounded-lg shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Filter calendar
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Employee name</label>
            <input
              type="text"
              value={filterEmployeeName}
              onChange={(e) => setFilterEmployeeName(e.target.value)}
              placeholder="Search by name..."
              className="border rounded px-2 py-1.5 text-sm min-w-[160px]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Department</label>
            <select
              value={filterDepartmentId}
              onChange={(e) => setFilterDepartmentId(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm min-w-[140px]"
            >
              <option value="">All departments</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Designation</label>
            <select
              value={filterDesignation}
              onChange={(e) => setFilterDesignation(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm min-w-[140px]"
            >
              <option value="">All designations</option>
              {designationOptions.map((des) => (
                <option key={des} value={des}>
                  {des}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterEmployeeName('');
              setFilterDepartmentId('');
              setFilterDesignation('');
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
          >
            Clear filters
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Showing {filteredEmployees.length} of {(data.employees || []).length} employees
        </p>
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
        <div className="mb-4 p-5 bg-white border rounded-lg shadow-sm space-y-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Mark (admin)</h2>
          <p className="text-xs text-gray-500 mb-3">Set a date to mark one day, or set a day (e.g. Sunday) to mark all that weekday in the current month. Optional: department and label.</p>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Date</label>
              <input
                type="date"
                value={markDate}
                onChange={(e) => setMarkDate(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Day (optional)</label>
              <select
                value={markDayOfWeek}
                onChange={(e) => setMarkDayOfWeek(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm min-w-[120px]"
              >
                <option value="">—</option>
                {DAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Department</label>
              <select
                value={markDepartmentId}
                onChange={(e) => setMarkDepartmentId(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm min-w-[160px]"
              >
                <option value="">All departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Mark as</label>
              <select
                value={markType}
                onChange={(e) => setMarkType(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              >
                <option value="important">Important (no leave)</option>
                <option value="holiday">Holiday</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Label (optional)</label>
              <input
                type="text"
                value={markLabel}
                onChange={(e) => setMarkLabel(e.target.value)}
                placeholder="e.g. Company event"
                className="border rounded px-2 py-1.5 text-sm w-40"
              />
            </div>
            <button
              type="button"
              onClick={handleMark}
              disabled={markSubmitting || (!markDate && (markDayOfWeek === '' || markDayOfWeek === undefined))}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {markSubmitting ? 'Applying...' : 'Apply'}
            </button>
          </div>

          <div className="pt-5 border-t border-gray-200">
            <h3 className="text-base font-semibold text-gray-800 mb-1">Unmark (admin)</h3>
            <p className="text-xs text-gray-500 mb-3">Remove by date (one day) or by day (all that weekday in the current month). Optional: department and label.</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Date</label>
                <input
                  type="date"
                  value={unmarkDate}
                  onChange={(e) => setUnmarkDate(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Day (optional)</label>
                <select
                  value={unmarkDayOfWeek}
                  onChange={(e) => setUnmarkDayOfWeek(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm min-w-[120px]"
                >
                  <option value="">—</option>
                  {DAY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Department</label>
                <select
                  value={unmarkDepartmentId}
                  onChange={(e) => setUnmarkDepartmentId(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm min-w-[160px]"
                >
                  <option value="">All departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Unmark as</label>
                <select
                  value={unmarkType}
                  onChange={(e) => setUnmarkType(e.target.value)}
                  className="border rounded px-2 py-1.5 text-sm"
                >
                  <option value="important">Important</option>
                  <option value="holiday">Holiday</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Label (optional)</label>
                <input
                  type="text"
                  value={unmarkLabel}
                  onChange={(e) => setUnmarkLabel(e.target.value)}
                  placeholder="Match this label only"
                  className="border rounded px-2 py-1.5 text-sm w-40"
                />
              </div>
              <button
                type="button"
                onClick={handleUnmark}
                disabled={unmarkSubmitting || (!unmarkDate && (unmarkDayOfWeek === '' || unmarkDayOfWeek === undefined))}
                className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
              >
                {unmarkSubmitting ? 'Unmarking...' : 'Unmark'}
              </button>
            </div>
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
                const headerLabels = isImportant ? getImportantLabelsForDate(d) : [];
                // Header should not change color when marking Important; only holidays/Sundays are colored.
                const headerBg = isHoliday ? 'bg-sky-200 text-gray-800' : 'text-gray-700';
                const isMarked = isImportant || holidaySet.has(d);
                const headerTitle = isImportant
                  ? headerLabels.length
                    ? `Important (no leave): ${headerLabels.join(', ')}`
                    : 'Important (no leave)'
                  : isHoliday
                  ? 'Holiday'
                  : '';
                return (
                  <th
                    key={d}
                    className={`sticky top-0 z-10 min-w-[3.5rem] w-14 px-1 py-2 text-center font-medium ${headerBg}`}
                    title={headerTitle}
                  >
                    <div className="flex flex-col items-center">
                      <span>{new Date(d + 'T12:00:00').getDate()}</span>
                      {isAdmin && (
                        <span className="mt-1">
                          {isMarked ? (
                            <button
                              type="button"
                              onClick={() => unmarkDateBlocked(d, isImportant ? 'important' : 'holiday')}
                              className="p-0.5 rounded hover:bg-black/10"
                              title="Unmark"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markDateAsBlocked(d, 'important')}
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
            {filteredEmployees.map((emp) => {
              const empLeaves = (data.leaves || []).filter((l) => l.employee_id === emp.id);
              return (
                <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 px-3 py-1.5 font-medium text-gray-800 bg-white border-r border-gray-200" title={[emp.department, emp.designation].filter(Boolean).join(' · ') || undefined}>
                    {emp.name}
                    {(emp.department || emp.designation) && (
                      <span className="block text-xs font-normal text-gray-500">
                        {[emp.department, emp.designation].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  {days.map((dateStr) => {
                    const leave = empLeaves.find(
                      (l) => toDateStr(l.start_date) <= dateStr && toDateStr(l.end_date) >= dateStr
                    );
                    let style = getCellStyle(leave, dateStr);
                    const importantForEmp = !leave && isDateImportantForEmployee(dateStr, emp);
                    const importantLabelsForEmp = importantForEmp
                      ? getImportantLabelsForEmployeeOnDate(dateStr, emp)
                      : [];
                    const holidayLabels = getHolidayLabelsForDate(dateStr);
                    const isHolidayCell = holidaySet.has(dateStr) || isSunday(dateStr);
                    if (!style) {
                      if (importantForEmp) style = getDeptImportantColor(emp.department_id);
                      else if (isHolidayCell) style = CELL_COLORS.holiday;
                      else style = 'bg-gray-50';
                    }
                    const leaveLabel = leave ? getLeaveSegmentLabel(leave) : '';
                    const importantDisplayLabel = importantLabelsForEmp.length ? importantLabelsForEmp[0] : (importantForEmp ? 'Important' : '');
                    const holidayDisplayLabel = holidayLabels.length ? holidayLabels[0] : (isHolidayCell ? 'Holiday' : '');
                    const cellLabel = leaveLabel || importantDisplayLabel || holidayDisplayLabel || '';
                    const tooltipParts = [];
                    if (leave) {
                      tooltipParts.push(leave.status || 'Leave');
                      tooltipParts.push(getLeaveSegmentLabel(leave));
                      if (leave.reason) tooltipParts.push(leave.reason);
                    } else if (importantForEmp) {
                      tooltipParts.push('Important (no leave)');
                      if (importantLabelsForEmp.length) tooltipParts.push(importantLabelsForEmp.join(', '));
                    } else if (isHolidayCell) {
                      tooltipParts.push(holidayLabels.length ? `Holiday: ${holidayLabels.join(', ')}` : 'Holiday');
                    }
                    return (
                      <td
                        key={dateStr}
                        className={`min-w-[3.5rem] w-14 h-9 p-0.5 align-middle ${style}`}
                        title={tooltipParts.filter(Boolean).join(' · ')}
                      >
                        {cellLabel && (
                          <span
                            className={`block text-[10px] font-medium leading-tight truncate px-0.5 text-center ${style && (style.includes('red') || style.includes('purple')) ? 'text-white' : 'text-gray-800'}`}
                            title={tooltipParts.filter(Boolean).join(' · ')}
                          >
                            {cellLabel.length > 8 ? cellLabel.slice(0, 7) + '…' : cellLabel}
                          </span>
                        )}
                      </td>
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
