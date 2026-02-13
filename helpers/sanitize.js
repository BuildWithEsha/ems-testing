// Normalize various Assigned To payload shapes into a comma-separated string of names
const toAssignedToString = (taskData) => {
  if (!taskData) return '';
  if (typeof taskData.assigned_to === 'string' && taskData.assigned_to.trim()) {
    return taskData.assigned_to.trim();
  }
  const src = taskData.assignedTo;
  if (!src) return '';
  if (typeof src === 'string') return src;
  if (Array.isArray(src)) {
    return src
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if (item.label) return String(item.label).split(' (')[0];
          if (item.name) return String(item.name);
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  return '';
};

// Helper to sanitize values for MySQL - handles arrays, objects, empty strings, and ISO dates
const sanitizeForMySQL = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : null;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return null;
    }
  }
  if (typeof value === 'string') {
    if (value.trim() === '') return null;

    if (value.includes('T') && (value.includes('Z') || value.match(/[+-]\d{2}:\d{2}$/))) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }
      } catch (e) {
        console.error('Error parsing date:', value, e);
        return value;
      }
    }

    return value;
  }
  return value;
};

module.exports = { sanitizeForMySQL, toAssignedToString };
