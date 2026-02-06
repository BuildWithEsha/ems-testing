import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronLeft, ChevronRight, Lock, Unlock } from 'lucide-react';

const CELL_COLORS = {
  holiday: 'bg-sky-200',
  rejected: 'bg-red-400',
  awol: 'bg-purple-400',
  full_day: 'bg-green-300',
  first_half: 'bg-yellow-300',
  second_half: 'bg-green-600',
  blocked: 'bg-gray-300 bg-opacity-80',
};

function getCellStyle(leave, dateStr) {
  if (!leave) return '';
  const d = dateStr;
  if (leave.start_date > d || leave.end_date < d) return '';
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

export default function LeavesCalendar() {
  const { user } = useAuth();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [data, setData] = useState({ employees: [], leaves: [], blockedDates: [] });
  const [loading, setLoading] = useState(true);
  const isAdmin = user?.role === 'admin' || user?.role === 'Admin';

  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaves/calendar?start=${start}&end=${end}`)
      .then((res) => res.ok ? res.json() : { employees: [], leaves: [], blockedDates: [] })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ employees: [], leaves: [], blockedDates: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [start, end]);

  const days = getDaysInMonth(year, month);
  const blockedSet = new Set((data.blockedDates || []).map((b) => b.date));

  const markImportant = async (date) => {
    if (!isAdmin) return;
    try {
      const res = await fetch('/api/leaves/blocked-dates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user?.role || 'employee',
        },
        body: JSON.stringify({ date }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setData((prev) => ({
          ...prev,
          blockedDates: [...(prev.blockedDates || []), { date, label: null }],
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const unmarkImportant = async (date) => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`/api/leaves/blocked-dates/${date}`, {
        method: 'DELETE',
        headers: { 'x-user-role': user?.role || 'employee' },
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setData((prev) => ({
          ...prev,
          blockedDates: (prev.blockedDates || []).filter((b) => b.date !== date),
        }));
      }
    } catch (e) {
      console.error(e);
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
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded ${CELL_COLORS.blocked}`} />
            <span className="text-sm text-gray-700">Important (no leave)</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-white border rounded-lg shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 z-10 min-w-[140px] px-3 py-2 text-left font-medium text-gray-700 bg-gray-50 border-r border-gray-200">
                Employee
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className={`px-1 py-2 text-center font-medium w-8 ${
                    blockedSet.has(d) ? 'bg-gray-300 text-gray-700' : 'text-gray-700'
                  }`}
                  title={blockedSet.has(d) ? 'Important date' : ''}
                >
                  <div className="flex flex-col items-center">
                    <span>{new Date(d).getDate()}</span>
                    {isAdmin && (
                      <span className="mt-1">
                        {blockedSet.has(d) ? (
                          <button
                            type="button"
                            onClick={() => unmarkImportant(d)}
                            className="p-0.5 rounded hover:bg-gray-400 text-gray-600"
                            title="Unmark important"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => markImportant(d)}
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
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.employees || []).map((emp) => {
              const empLeaves = (data.leaves || []).filter((l) => l.employee_id === emp.id);
              return (
                <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 px-3 py-1.5 font-medium text-gray-800 bg-white border-r border-gray-200">
                    {emp.name}
                  </td>
                  {days.map((dateStr) => {
                    const leave = empLeaves.find(
                      (l) => l.start_date <= dateStr && l.end_date >= dateStr
                    );
                    const style = getCellStyle(leave, dateStr);
                    return (
                      <td
                        key={dateStr}
                        className={`w-8 h-8 p-0 align-middle ${style || 'bg-gray-50'}`}
                        title={
                          leave
                            ? `${leave.status} ${leave.start_segment || ''}-${leave.end_segment || ''}`
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
      {isAdmin && (
        <p className="mt-3 text-xs text-gray-500">
          Click the lock icon on a date to mark it as important (no leave allowed). Click the unlock icon to remove.
        </p>
      )}
    </div>
  );
}
