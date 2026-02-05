import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Hook for admin over-estimate task notifications
export const useOverEstimateTaskNotifications = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [designation, setDesignation] = useState('');
  const [minOverMinutes, setMinOverMinutes] = useState(10);

  const hasAccess =
    !!user &&
    ((user.role === 'admin' || user.role === 'Admin') ||
      user.permissions?.includes('all') ||
      user.permissions?.includes('view_overestimate_tasks'));

  const fetchOverEstimateNotifications = async (options = {}) => {
    if (!hasAccess) {
      setItems([]);
      return;
    }

    const effectiveStart = options.startDate || startDate;
    const effectiveEnd = options.endDate || endDate;
    const effectiveDesignation = options.designation ?? designation;
    const effectiveMinOver = options.minOverMinutes ?? minOverMinutes;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('start', effectiveStart);
      params.set('end', effectiveEnd);
      if (effectiveDesignation) params.set('designation', effectiveDesignation);
      if (effectiveMinOver != null) params.set('min_over_minutes', String(effectiveMinOver));

      const response = await fetch(`/api/notifications/tasks-over-estimate?${params.toString()}`, {
        headers: {
          'x-user-role': user?.role || 'Admin',
          'x-user-permissions': JSON.stringify(
            (user?.role === 'admin' || user?.role === 'Admin')
              ? ['all']
              : (user?.permissions || [])
          )
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch over-estimate task notifications');
      }

      const data = await response.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      console.error('Error fetching over-estimate task notifications:', err);
      setError(err.message || 'Failed to fetch over-estimate task notifications');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverEstimateNotifications();
  }, [user]);

  const updateFilters = ({ start, end, designation: newDesignation, minOver }) => {
    if (start) setStartDate(start);
    if (end) setEndDate(end);
    if (typeof newDesignation === 'string') setDesignation(newDesignation);
    if (typeof minOver === 'number') setMinOverMinutes(minOver);
    fetchOverEstimateNotifications({
      startDate: start || startDate,
      endDate: end || endDate,
      designation: newDesignation ?? designation,
      minOverMinutes: typeof minOver === 'number' ? minOver : minOverMinutes
    });
  };

  return {
    items,
    loading,
    error,
    startDate,
    endDate,
    designation,
    minOverMinutes,
    hasAccess,
    updateFilters,
    refresh: () => fetchOverEstimateNotifications()
  };
};

