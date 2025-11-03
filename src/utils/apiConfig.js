/**
 * API Configuration
 * Determines the API base URL based on environment
 * In production, uses relative URLs (same origin as frontend)
 * In development, uses localhost:5000
 */

// Get API base URL based on environment
const getApiBaseUrl = () => {
  // In production (when served from same server), use relative path
  if (process.env.NODE_ENV === 'production') {
    return ''; // Empty = relative path (same origin)
  }
  // In development, use localhost
  // Check if REACT_APP_API_URL is set (can be set via .env)
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

// Helper function to build API URL
export const getApiUrl = (endpoint) => {
  // Remove leading slash from endpoint if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  // Remove 'api/' if present (we'll add it)
  const apiEndpoint = cleanEndpoint.startsWith('api/') ? cleanEndpoint : `api/${cleanEndpoint}`;
  
  if (API_BASE_URL) {
    return `${API_BASE_URL}/${apiEndpoint}`;
  }
  // If API_BASE_URL is empty (production), return relative path
  return `/${apiEndpoint}`;
};

// Export for direct use
export default API_BASE_URL;

