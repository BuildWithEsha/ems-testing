import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useLowIdleNotifications = () => {
  const { user } = useAuth();
  const [lowIdleNotifications, setLowIdleNotifications] = useState([]);
  const [hasLowIdleNotifications, setHasLowIdleNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [maxIdleHours, setMaxIdleHours] = useState(3);
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );

  const fetchLowIdleNotifications = async (maxHours = maxIdleHours, date = selectedDate) => {
    if (!user?.permissions?.includes('low_idle_view') && !user?.permissions?.includes('all') && user?.role !== 'admin' && user?.role !== 'Admin') {
      setLowIdleNotifications([]);
      setHasLowIdleNotifications(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/notifications/low-idle-employees?maxIdleHours=${maxHours}&date=${date}`,
        {
          headers: {
            'x-user-role': user?.role || 'Admin',
            'x-user-permissions': JSON.stringify(user?.permissions || ['all'])
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        setLowIdleNotifications(Array.isArray(data) ? data : []);
        setHasLowIdleNotifications(Array.isArray(data) ? data.length > 0 : false);
      } else {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.error || errData.message || `Request failed (${response.status})`;
        throw new Error(msg);
      }
    } catch (err) {
      setError(err.message);
      setLowIdleNotifications([]);
      setHasLowIdleNotifications(false);
    } finally {
      setLoading(false);
    }
  };

  const updateMaxIdleHours = (newMax) => {
    setMaxIdleHours(newMax);
    fetchLowIdleNotifications(newMax, selectedDate);
  };

  const updateSelectedDate = (newDate) => {
    setSelectedDate(newDate);
    fetchLowIdleNotifications(maxIdleHours, newDate);
  };

  const updateSettings = (newMaxIdleHours, newDate) => {
    setMaxIdleHours(newMaxIdleHours);
    setSelectedDate(newDate);
    fetchLowIdleNotifications(newMaxIdleHours, newDate);
  };

  useEffect(() => {
    fetchLowIdleNotifications();
    const interval = setInterval(() => fetchLowIdleNotifications(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  return {
    lowIdleNotifications,
    hasLowIdleNotifications,
    loading,
    error,
    maxIdleHours,
    selectedDate,
    refreshLowIdleNotifications: () => fetchLowIdleNotifications(maxIdleHours, selectedDate),
    updateMaxIdleHours,
    updateSelectedDate,
    updateSettings
  };
};
