// API Helper utilities for handling paginated responses

export const handleApiResponse = (data) => {
  // Handle both paginated and non-paginated API responses
  if (data && typeof data === 'object' && 'data' in data) {
    return data.data; // Paginated response
  }
  return data; // Non-paginated response
};

export const fetchWithErrorHandling = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return handleApiResponse(data);
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
};

// Safe array access for components
export const safeArray = (data, fallback = []) => {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.data)) {
    return data.data;
  }
  return fallback;
};

// Safe API response handler specifically for arrays
export const safeApiArray = (data, fallback = []) => {
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

// Safe fetch function that always returns an array
export const fetchArray = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return safeApiArray(data);
  } catch (error) {
    console.error('API fetch error:', error);
    return [];
  }
};
