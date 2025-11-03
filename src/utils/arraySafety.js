// Array safety utilities to prevent runtime errors

export const safeArray = (data, fallback = []) => {
  // Handle null/undefined
  if (data == null) return fallback;
  
  // Handle paginated response
  if (data && typeof data === 'object' && 'data' in data) {
    return Array.isArray(data.data) ? data.data : fallback;
  }
  
  // Handle direct array
  if (Array.isArray(data)) return data;
  
  // Fallback for any other type
  return fallback;
};

export const safeMap = (array, callback, fallback = []) => {
  const safeArr = safeArray(array, fallback);
  return safeArr.map(callback);
};

export const safeFilter = (array, callback, fallback = []) => {
  const safeArr = safeArray(array, fallback);
  return safeArr.filter(callback);
};

export const safeFind = (array, callback, fallback = null) => {
  const safeArr = safeArray(array, []);
  return safeArr.find(callback) || fallback;
};

export const safeForEach = (array, callback) => {
  const safeArr = safeArray(array, []);
  return safeArr.forEach(callback);
};

export const safeReduce = (array, callback, initialValue) => {
  const safeArr = safeArray(array, []);
  return safeArr.reduce(callback, initialValue);
};

// Higher-order function to make any array method safe
export const makeSafe = (array, fallback = []) => {
  const safeArr = safeArray(array, fallback);
  return {
    map: (callback) => safeArr.map(callback),
    filter: (callback) => safeArr.filter(callback),
    find: (callback) => safeArr.find(callback),
    forEach: (callback) => safeArr.forEach(callback),
    reduce: (callback, initialValue) => safeArr.reduce(callback, initialValue),
    length: safeArr.length,
    [Symbol.iterator]: () => safeArr[Symbol.iterator]()
  };
};
