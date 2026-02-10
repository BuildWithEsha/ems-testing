import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useNotifications = (selectedDate = null) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper: format a Date as local YYYY-MM-DD without shifting a day
  const toLocalIsoDate = (d) => {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };

  const fetchForDate = async (dateStr) => {
    // Use provided date string (YYYY-MM-DD) and return raw notifications
    const dateIso = dateStr;
    const displayDate = new Date(dateIso + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const response = await fetch(
      `/api/notifications/dwm-incomplete?date=${dateIso}`,
      {
        headers: {
          'x-user-role': 'Admin',
          'x-user-permissions': '["all"]'
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    const data = await response.json();
    return data.map((notification) => ({
      ...notification,
      displayDate,
      date: dateIso
    }));
  };

  const fetchNotifications = async (date = selectedDate) => {
    // Check if user has dwm_view permission
    if (!user?.permissions?.includes('dwm_view') && !user?.permissions?.includes('all') && user?.role !== 'admin') {
      setNotifications([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use provided date string (YYYY-MM-DD) or default to yesterday (local)
      let dateStr = date;
      if (!dateStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        dateStr = toLocalIsoDate(yesterday);
      }

      console.log('🔔 DWM Debug: Fetching notifications for date:', dateStr);
      console.log('🔔 DWM Debug: Current date:', new Date().toISOString().split('T')[0]);

      const notificationsForDay = await fetchForDate(dateStr);
      console.log('🔔 DWM Debug: Number of notifications received:', notificationsForDay.length);
      setNotifications(notificationsForDay);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError(err.message);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    
    // Refresh notifications every hour
    const interval = setInterval(fetchNotifications, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user]);

  const refreshNotifications = (date = selectedDate) => {
    fetchNotifications(date);
  };

  const refreshNotificationsRange = async (startDate, endDate) => {
    // Inclusive date range [startDate, endDate]
    if (!startDate || !endDate) return;

    // Check permission first (same as single-day)
    if (
      !user?.permissions?.includes('dwm_view') &&
      !user?.permissions?.includes('all') &&
      user?.role !== 'admin'
    ) {
      setNotifications([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Invalid date range');
      }

      const all = [];
      const cursor = new Date(start.getTime());
      while (cursor <= end) {
        const iso = cursor.toISOString().split('T')[0];
        // eslint-disable-next-line no-await-in-loop
        const dayNotifications = await fetchForDate(iso);
        all.push(...dayNotifications);
        cursor.setDate(cursor.getDate() + 1);
      }

      setNotifications(all);
    } catch (err) {
      console.error('Error fetching notifications range:', err);
      setError(err.message);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  return {
    notifications,
    loading,
    error,
    refreshNotifications,
    refreshNotificationsRange,
    hasNotifications: notifications.length > 0
  };
};
