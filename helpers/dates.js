// Helper to format attendance timestamps consistently for clients
const formatAttendanceDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
  }

  const strValue = String(value).trim();
  if (!strValue) return null;

  if (strValue.includes('T')) {
    if (strValue.includes('Z')) return strValue;
    return strValue.includes('.') ? strValue + 'Z' : strValue + '.000Z';
  }

  if (strValue.includes(' ')) {
    const [datePart, timePart] = strValue.split(' ');
    const timeWithMs = timePart.includes('.') ? timePart.split('.')[0] : timePart;
    return `${datePart}T${timeWithMs}.000Z`;
  }

  const parsed = new Date(strValue);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const seconds = String(parsed.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
  }

  return strValue;
};

// Helper: get year/month from a YYYY-MM-DD date string
const getYearMonthFromDate = (dateStr) => {
  if (!dateStr) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const parts = String(dateStr).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!year || !month) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
};

// Helper: get epoch milliseconds for a specific day with timezone offset
function getEpochMsForDay(dateStr, timezoneOffsetMinutes = 330) {
  const midnightUtc = new Date(dateStr + 'T00:00:00.000Z').getTime();
  const startMs = midnightUtc - timezoneOffsetMinutes * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { startMs, endMs };
}

// Helper: get epoch milliseconds for a date range with timezone offset
function getEpochMsForRange(startDateStr, endDateStr, timezoneOffsetMinutes = 330) {
  const norm = (s) => (typeof s === 'string' && s.includes('T') ? s.split('T')[0] : s);
  const start = norm(startDateStr);
  const end = norm(endDateStr);
  const { startMs } = getEpochMsForDay(start, timezoneOffsetMinutes);
  const endDay = getEpochMsForDay(end, timezoneOffsetMinutes);
  // Use start of next day as endTime so the full last day is included (Team Logger treats endTime as exclusive)
  const endMs = endDay.startMs + 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

// Shared helper: derive idle hours from Team Logger employee_summary_report row
function getIdleHours(row) {
  if (!row || typeof row !== 'object') return 0;
  const h = row.idleHours ?? row.idle_hours ?? row.IdleHours;
  if (h != null && h !== '') {
    const num = typeof h === 'number' ? h : parseFloat(h);
    if (!Number.isNaN(num)) return num;
  }
  const sec = row.inactiveSecondsCount ?? row.inactive_seconds_count ?? row.InactiveSecondsCount;
  if (sec != null && sec !== '') {
    const num = typeof sec === 'number' ? sec : parseFloat(sec);
    if (!Number.isNaN(num)) return num / 3600;
  }
  // Fallback: find any key containing 'idle' (hours) or 'inactive' (seconds)
  const keys = Object.keys(row);
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (lower.includes('idle') && !lower.includes('inactive') && !lower.includes('second')) {
      const v = row[k];
      if (v != null && v !== '') {
        const num = typeof v === 'number' ? v : parseFloat(v);
        if (!Number.isNaN(num)) return num;
      }
    }
    if (lower.includes('inactive') && (lower.includes('second') || lower.includes('count'))) {
      const v = row[k];
      if (v != null && v !== '') {
        const num = typeof v === 'number' ? v : parseFloat(v);
        if (!Number.isNaN(num)) return num / 3600;
      }
    }
  }
  return 0;
}

module.exports = { formatAttendanceDate, getYearMonthFromDate, getEpochMsForDay, getEpochMsForRange, getIdleHours };
