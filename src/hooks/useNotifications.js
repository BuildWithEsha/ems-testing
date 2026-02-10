import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useNotifications = (selectedDate = null) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNotifications = async (dateOrRange = selectedDate) => {
    // Check if user has dwm_view permission
    if (!user?.permissions?.includes('dwm_view') && !user?.permissions?.includes('all') && user?.role !== 'admin') {
      setNotifications([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const isRange =
        dateOrRange &&
        typeof dateOrRange === 'object' &&
        dateOrRange.from &&
        dateOrRange.to;

      if (isRange) {
        // Date range: fetch notifications for each day in the range and combine
        const from = new Date(dateOrRange.from);
        const to = new Date(dateOrRange.to);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
          throw new Error('Invalid date range');
        }

        const allNotifications = [];
        for (
          let d = new Date(from.getTime());
          d <= to;
          d.setDate(d.getDate() + 1)
        ) {
          const targetDate = new Date(d.getTime());
          const dateStr = targetDate.toISOString().split('T')[0];
          const dateFormatted = targetDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });

          console.log('🔔 DWM Debug: Fetching notifications for date:', dateStr);

          const response = await fetch(
            `/api/notifications/dwm-incomplete?date=${dateStr}`,
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
          const notificationsWithDate = data.map((notification) => ({
            ...notification,
            displayDate: dateFormatted,
            date: dateStr
          }));
          allNotifications.push(...notificationsWithDate);
        }

        setNotifications(allNotifications);
      } else {
        const date = dateOrRange;
        // Use provided date or default to yesterday
        const targetDate = date
          ? new Date(date)
          : (() => {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              return yesterday;
            })();

        const dateStr = targetDate.toISOString().split('T')[0];

        // Format date for display
        const dateFormatted = targetDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        console.log('🔔 DWM Debug: Fetching notifications for date:', dateStr);
        console.log('🔔 DWM Debug: Formatted date:', dateFormatted);
        console.log(
          '🔔 DWM Debug: Current date:',
          new Date().toISOString().split('T')[0]
        );

        const response = await fetch(
          `/api/notifications/dwm-incomplete?date=${dateStr}`,
          {
            headers: {
              'x-user-role': 'Admin',
              'x-user-permissions': '["all"]'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('🔔 DWM Debug: API response data:', data);
          console.log(
            '🔔 DWM Debug: Number of notifications received:',
            data.length
          );

          // Add the formatted date to each notification for better display
          const notificationsWithDate = data.map((notification) => ({
            ...notification,
            displayDate: dateFormatted,
            date: dateStr
          }));
          setNotifications(notificationsWithDate);
        } else {
          throw new Error('Failed to fetch notifications');
        }
      }
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

  const refreshNotifications = (dateOrRange = selectedDate) => {
    fetchNotifications(dateOrRange);
  };

  return {
    notifications,
    loading,
    error,
    refreshNotifications,
    hasNotifications: notifications.length > 0
  };
};
