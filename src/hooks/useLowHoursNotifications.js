import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useLowHoursNotifications = () => {
  const { user } = useAuth();
  const [lowHoursNotifications, setLowHoursNotifications] = useState([]);
  const [hasLowHoursNotifications, setHasLowHoursNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [minHoursThreshold, setMinHoursThreshold] = useState(8); // Default 8 hours
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today's date
    return new Date().toISOString().split('T')[0];
  });

  const fetchLowHoursNotifications = async (minHours = minHoursThreshold, date = selectedDate) => {
    console.log('🔔 LHE Hook Debug - Starting fetchLowHoursNotifications');
    console.log('🔔 LHE Hook Debug - User:', user);
    console.log('🔔 LHE Hook Debug - User permissions:', user?.permissions);
    console.log('🔔 LHE Hook Debug - User role:', user?.role);
    console.log('🔔 LHE Hook Debug - Min hours threshold:', minHours);
    console.log('🔔 LHE Hook Debug - Date:', date);
    
    // Check if user has lhe_view permission, is admin, or is manager (role or designation)
    const isManagerByRole = user?.is_manager || (user?.role && String(user.role).toLowerCase() === 'manager');
    const isManagerByDesignation = user?.designation && String(user.designation).toLowerCase().includes('manager');
    if (!user?.permissions?.includes('lhe_view') && !user?.permissions?.includes('all') && user?.role !== 'admin' && user?.role !== 'Admin' && !isManagerByRole && !isManagerByDesignation) {
      console.log('🔔 LHE Hook Debug - User does not have LHE permissions, returning empty array');
      setLowHoursNotifications([]);
      setHasLowHoursNotifications(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('🔔 LHE Hook Debug - Making API request to low-hours-employees');

      const response = await fetch(`/api/notifications/low-hours-employees?minHours=${minHours}&date=${date}`, {
        headers: {
          'x-user-role': user?.role || 'Admin',
          'x-user-permissions': JSON.stringify(user?.permissions || ['all']),
          ...(user?.designation != null && user.designation !== '' ? { 'x-user-designation': String(user.designation) } : {})
        }
      });
      
      console.log('🔔 LHE Hook Debug - Response status:', response.status);
      console.log('🔔 LHE Hook Debug - Response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔔 LHE Hook Debug - Received data:', data);
        console.log('🔔 LHE Hook Debug - Number of notifications:', data.length);
        setLowHoursNotifications(data);
        setHasLowHoursNotifications(data.length > 0);
      } else {
        throw new Error('Failed to fetch low hours employee notifications');
      }
    } catch (err) {
      console.error('Error fetching low hours employee notifications:', err);
      setError(err.message);
      setLowHoursNotifications([]);
      setHasLowHoursNotifications(false);
    } finally {
      setLoading(false);
    }
  };

  const updateMinHoursThreshold = (newMinHours) => {
    setMinHoursThreshold(newMinHours);
    fetchLowHoursNotifications(newMinHours, selectedDate);
  };

  const updateSelectedDate = (newDate) => {
    setSelectedDate(newDate);
    fetchLowHoursNotifications(minHoursThreshold, newDate);
  };

  /** Update both threshold and date in one go (used when user clicks Update in settings). Prevents race where second fetch used stale threshold. */
  const updateSettings = (newMinHours, newDate) => {
    setMinHoursThreshold(newMinHours);
    setSelectedDate(newDate);
    fetchLowHoursNotifications(newMinHours, newDate);
  };

  useEffect(() => {
    fetchLowHoursNotifications();
    
    // Refresh low hours notifications every 30 minutes
    const interval = setInterval(() => fetchLowHoursNotifications(), 30 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user]);

  const refreshLowHoursNotifications = () => {
    fetchLowHoursNotifications();
  };

  return {
    lowHoursNotifications,
    hasLowHoursNotifications,
    loading,
    error,
    minHoursThreshold,
    selectedDate,
    refreshLowHoursNotifications,
    updateMinHoursThreshold,
    updateSelectedDate,
    updateSettings
  };
};
