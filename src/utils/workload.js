// Utility to compute per-employee workload totals from tasks
// Assumptions:
// - Task assignment stored in task.assigned_to as a comma-separated string of names
// - Time estimates may be stored in one or more of:
//   - task.time_estimate_minutes (number of minutes)
//   - task.time_estimate_hours (number of hours)
//   - task.time_estimate (string like "2h 30m" or number of minutes)
// - Recurrence determined by task.labels string containing 'Daily', 'Weekly', or 'Monthly'
// - Weekly tasks are counted on the date that matches their due_date's weekday when due_date exists; otherwise, they are not included (insufficient data to infer weekday)

function parseMinutesFromEstimate(task) {
  // ✅ FIX: Combine both hours AND minutes (was only returning one or the other)
  const minutes = Number(task.time_estimate_minutes);
  const hours = Number(task.time_estimate_hours);
  
  const validMinutes = !Number.isNaN(minutes) && minutes >= 0 ? minutes : 0;
  const validHours = !Number.isNaN(hours) && hours >= 0 ? hours : 0;
  
  // If we have hours or minutes, combine them
  if (validHours > 0 || validMinutes > 0) {
    return Math.round(validHours * 60) + validMinutes;
  }

  // Some backends may store a combined numeric minutes field named time_estimate
  if (typeof task.time_estimate === 'number' && Number.isFinite(task.time_estimate)) {
    const m = Math.round(task.time_estimate);
    if (m > 0) return m;
  }

  const raw = task.time_estimate;
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  if (typeof raw === 'string') {
    // try formats: "150", "2h", "2h 30m", "90m"
    const trimmed = raw.trim().toLowerCase();
    const numOnly = Number(trimmed);
    if (Number.isFinite(numOnly)) return Math.max(0, Math.round(numOnly));
    let total = 0;
    const hMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*h/);
    const mMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*m/);
    if (hMatch) total += Math.round(parseFloat(hMatch[1]) * 60);
    if (mMatch) total += Math.round(parseFloat(mMatch[1]));
    return Math.max(0, total);
  }
  return 0;
}

function hasLabel(task, label) {
  const labels = String(task.labels || '').toLowerCase();
  return labels.includes(String(label).toLowerCase());
}

function normalizeAssigneeName(text) {
  const raw = String(text || '').trim();
  // Drop anything in parentheses: "Name (EMP-123)" -> "Name"
  const noParens = raw.replace(/\s*\([^)]*\)\s*$/, '');
  return noParens.toLowerCase();
}

function isAssignedTo(task, employeeName) {
  const target = normalizeAssigneeName(employeeName);
  const assignedRaw = String(task.assigned_to || '');
  const assigned = assignedRaw
    .split(/[,|;]+/) // support comma, pipe, or semicolon separated
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalizeAssigneeName);
  return assigned.some(name => name === target || name.startsWith(target));
}

function toISODateLocal(date) {
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function sameWeekday(dateA, dateB) {
  return new Date(dateA).getDay() === new Date(dateB).getDay();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  // Assuming week starts on Monday; adjust if needed
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  return addDays(d, diff);
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6);
}

function startOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function normalizeWeekday(value) {
  if (!value) return '';
  const map = {
    mon: 'monday', monday: 'monday',
    tue: 'tuesday', tues: 'tuesday', tuesday: 'tuesday',
    wed: 'wednesday', wednesday: 'wednesday',
    thu: 'thursday', thur: 'thursday', thurs: 'thursday', thursday: 'thursday',
    fri: 'friday', friday: 'friday',
    sat: 'saturday', saturday: 'saturday',
    sun: 'sunday', sunday: 'sunday'
  };
  const key = String(value).trim().toLowerCase();
  return map[key] || '';
}

function weekdayName(date) {
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date).getDay()];
}

function taskMatchesWeeklyDay(task, dateISO) {
  const wd = weekdayName(dateISO);
  // support common fields that might store the weekday
  const candidates = [task.weekly_day, task.week_day, task.weekday, task.repeat_day, task.repeat_on];
  for (const c of candidates) {
    if (!c) continue;
    const val = normalizeWeekday(c);
    if (val && val === wd) return true;
  }
  // try to infer weekday from title or task name, e.g., "(Saturday)" or "Saturday Report"
  const title = String(task.title || task.task || '').toLowerCase();
  if (title) {
    const weekNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    for (const name of weekNames) {
      if (title.includes(name) && name === wd) return true;
    }
  }
  // fallback to due_date weekday
  if (task.due_date && sameWeekday(task.due_date, dateISO)) return true;
  return false;
}

function computeForDate(tasks, employeeName, targetDate) {
  const iso = toISODateLocal(targetDate);
  let daily = 0;
  let weekly = 0;
  let monthly = 0;

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!isAssignedTo(task, employeeName)) continue;
    const minutes = parseMinutesFromEstimate(task);
    if (minutes <= 0) continue;
    const isDaily = hasLabel(task, 'Daily') || hasLabel(task, 'Daily Task');
    const isWeekly = hasLabel(task, 'Weekly') || hasLabel(task, 'Weekly Task');
    const isMonthly = hasLabel(task, 'Monthly') || hasLabel(task, 'Monthly Task');

    if (isDaily) {
      daily += minutes;
    }

    if (isWeekly && taskMatchesWeeklyDay(task, iso)) {
      weekly += minutes;
    }

    if (isMonthly) {
      // Count monthly tasks on exact due_date if present
      const dueIso = task.due_date ? toISODateLocal(task.due_date) : '';
      const dateObj = new Date(iso);
      let matches = false;
      if (dueIso && dueIso === iso) {
        matches = true;
      } else {
        // If no due_date, try to infer day-of-month from title like "(8th of Month)"
        const title = String(task.title || task.task || '').toLowerCase();
        const m = title.match(/\((\d{1,2})(?:st|nd|rd|th)?\s*(?:of)?\s*month\)/i) || title.match(/\bmonthly\s*\(?(\d{1,2})(?:st|nd|rd|th)?\)?/i);
        if (m) {
          const dayNum = Math.max(1, Math.min(31, parseInt(m[1], 10)));
          if (dateObj.getDate() === dayNum) matches = true;
        }
      }
      if (matches) monthly += minutes;
    }
  }

  return { iso, totals: { daily, weekly, monthly }, totalMinutes: daily + weekly + monthly };
}

/**
 * Returns the list of tasks that count toward the employee's workload for the given date
 * (daily tasks + weekly tasks matching the day + monthly tasks matching the date).
 */
export function getWorkloadTasksForDate(tasks, employeeName, targetDate) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const iso = toISODateLocal(targetDate);
  const result = [];

  for (const task of taskList) {
    if (!isAssignedTo(task, employeeName)) continue;
    const minutes = parseMinutesFromEstimate(task);
    if (minutes <= 0) continue;
    const isDaily = hasLabel(task, 'Daily') || hasLabel(task, 'Daily Task');
    const isWeekly = hasLabel(task, 'Weekly') || hasLabel(task, 'Weekly Task');
    const isMonthly = hasLabel(task, 'Monthly') || hasLabel(task, 'Monthly Task');

    if (isDaily) {
      result.push(task);
      continue;
    }
    if (isWeekly && taskMatchesWeeklyDay(task, iso)) {
      result.push(task);
      continue;
    }
    if (isMonthly) {
      const dueIso = task.due_date ? toISODateLocal(task.due_date) : '';
      const dateObj = new Date(iso);
      let matches = false;
      if (dueIso && dueIso === iso) {
        matches = true;
      } else {
        const title = String(task.title || task.task || '').toLowerCase();
        const m = title.match(/\((\d{1,2})(?:st|nd|rd|th)?\s*(?:of)?\s*month\)/i) || title.match(/\bmonthly\s*\(?(\d{1,2})(?:st|nd|rd|th)?\)?/i);
        if (m) {
          const dayNum = Math.max(1, Math.min(31, parseInt(m[1], 10)));
          if (dateObj.getDate() === dayNum) matches = true;
        }
      }
      if (matches) result.push(task);
    }
  }
  return result;
}

export function computeWorkloadForEmployee(tasks, employee, anchorDate) {
  const employeeName = employee?.name || employee;
  const shiftHours = Number(employee?.working_hours) || 8;
  const date = anchorDate ? new Date(anchorDate) : new Date();

  // Day
  const day = computeForDate(tasks, employeeName, date);

  // Week
  const weekStart = startOfWeek(date);
  const weekEnd = endOfWeek(date);
  const weekDays = [];
  let cursor = new Date(weekStart);
  while (cursor <= weekEnd) {
    weekDays.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  const week = weekDays.map(d => computeForDate(tasks, employeeName, d));
  const weekTotal = week.reduce((s, d) => s + d.totalMinutes, 0);

  // Month
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const monthDays = [];
  cursor = new Date(monthStart);
  while (cursor <= monthEnd) {
    monthDays.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  const month = monthDays.map(d => computeForDate(tasks, employeeName, d));
  const monthTotal = month.reduce((s, d) => s + d.totalMinutes, 0);

  return {
    shiftHours,
    day: {
      dateISO: day.iso,
      totalMinutes: day.totalMinutes,
      breakdown: day.totals,
      deltaMinutes: day.totalMinutes - shiftHours * 60
    },
    week: {
      startISO: toISODateLocal(weekStart),
      endISO: toISODateLocal(weekEnd),
      days: week,
      totalMinutes: weekTotal
    },
    month: {
      startISO: toISODateLocal(monthStart),
      endISO: toISODateLocal(monthEnd),
      days: month,
      totalMinutes: monthTotal
    }
  };
}

export function formatHM(totalMinutes) {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, '0')}m`;
}


