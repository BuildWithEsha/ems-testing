import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const today = () => new Date().toISOString().split('T')[0];

export const useLowIdleNotifications = () => {
  const { user } = useAuth();
  const [lowIdleNotifications, setLowIdleNotifications] = useState([]);
  const [hasLowIdleNotifications, setHasLowIdleNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [minIdleHours, setMinIdleHours] = useState(0);
  const [minIdleMinutes, setMinIdleMinutes] = useState(30);

  // Currently idle (rolling window, e.g. last 15 min)
  const [currentlyIdleList, setCurrentlyIdleList] = useState([]);
  const [currentlyIdleLoading, setCurrentlyIdleLoading] = useState(false);
  const [currentlyIdleError, setCurrentlyIdleError] = useState(null);
  const [currentlyIdleWindowMinutes, setCurrentlyIdleWindowMinutes] = useState(15);
  const [currentlyIdleMinMinutes, setCurrentlyIdleMinMinutes] = useState(1);

  const fetchCurrentlyIdle = async (opts = {}) => {
    const win = opts.windowMinutes ?? currentlyIdleWindowMinutes;
    const minM = opts.minIdleMinutes ?? currentlyIdleMinMinutes;
    if (!user?.permissions?.includes('low_idle_view') && !user?.permissions?.includes('all') && user?.role !== 'admin' && user?.role !== 'Admin') {
      setCurrentlyIdleList([]);
      return;
    }
    try {
      setCurrentlyIdleLoading(true);
      setCurrentlyIdleError(null);
      const params = new URLSearchParams({
        windowMinutes: String(win),
        minIdleMinutes: String(minM)
      });
      const response = await fetch(
        `/api/notifications/currently-idle-employees?${params}`,
        {
          headers: {
            'x-user-role': user?.role || 'Admin',
            'x-user-permissions': JSON.stringify(user?.permissions || ['all'])
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        setCurrentlyIdleList(Array.isArray(data) ? data : []);
      } else {
        const errData = await response.json().catch(() => ({}));
        const msg = errData.error || errData.message || `Request failed (${response.status})`;
        throw new Error(msg);
      }
    } catch (err) {
      setCurrentlyIdleError(err.message);
      setCurrentlyIdleList([]);
    } finally {
      setCurrentlyIdleLoading(false);
    }
  };

  const fetchLowIdleNotifications = async (opts = {}) => {
    const s = opts.startDate ?? startDate;
    const e = opts.endDate ?? endDate;
    const h = opts.minIdleHours ?? minIdleHours;
    const m = opts.minIdleMinutes ?? minIdleMinutes;
    if (!user?.permissions?.includes('low_idle_view') && !user?.permissions?.includes('all') && user?.role !== 'admin' && user?.role !== 'Admin') {
      setLowIdleNotifications([]);
      setHasLowIdleNotifications(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        startDate: s,
        endDate: e,
        minIdleHours: String(h),
        minIdleMinutes: String(m)
      });
      const response = await fetch(
        `/api/notifications/low-idle-employees?${params}`,
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

  const updateSettings = (newStartDate, newEndDate, newMinIdleHours, newMinIdleMinutes) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    setMinIdleHours(newMinIdleHours);
    setMinIdleMinutes(newMinIdleMinutes);
    fetchLowIdleNotifications({
      startDate: newStartDate,
      endDate: newEndDate,
      minIdleHours: newMinIdleHours,
      minIdleMinutes: newMinIdleMinutes
    });
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
    startDate,
    endDate,
    minIdleHours,
    minIdleMinutes,
    refreshLowIdleNotifications: () => fetchLowIdleNotifications(),
    updateSettings,
    // Currently idle (rolling window)
    currentlyIdleList,
    currentlyIdleLoading,
    currentlyIdleError,
    currentlyIdleWindowMinutes,
    currentlyIdleMinMinutes,
    setCurrentlyIdleWindowMinutes,
    setCurrentlyIdleMinMinutes,
    refreshCurrentlyIdle: () => fetchCurrentlyIdle(),
    fetchCurrentlyIdle: (opts) => fetchCurrentlyIdle(opts)
  };
};
