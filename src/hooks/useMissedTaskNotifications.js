import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useMissedTaskNotifications = () => {
  const { user } = useAuth();
  const [missedTaskNotifications, setMissedTaskNotifications] = useState([]);
  const [hasMissedTaskNotifications, setHasMissedTaskNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [daysThreshold, setDaysThreshold] = useState(7); // Default 7 days

  const fetchMissedTaskNotifications = async (days = daysThreshold) => {
    console.log('🔔 MTW Hook Debug - Starting fetchMissedTaskNotifications');
    console.log('🔔 MTW Hook Debug - User:', user);
    console.log('🔔 MTW Hook Debug - User permissions:', user?.permissions);
    console.log('🔔 MTW Hook Debug - User role:', user?.role);
    console.log('🔔 MTW Hook Debug - Days threshold:', days);
    
    // Check if user has mtw_view permission
    if (!user?.permissions?.includes('mtw_view') && !user?.permissions?.includes('all') && user?.role !== 'admin' && user?.role !== 'Admin') {
      console.log('🔔 MTW Hook Debug - User does not have MTW permissions, returning empty array');
      setMissedTaskNotifications([]);
      setHasMissedTaskNotifications(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('🔔 MTW Hook Debug - Making API request to missed-tasks');

      const response = await fetch(`/api/notifications/missed-tasks?days=${days}`, {
        headers: {
          'x-user-role': 'Admin',
          'x-user-permissions': '["all"]'
        }
      });
      
      console.log('🔔 MTW Hook Debug - Response status:', response.status);
      console.log('🔔 MTW Hook Debug - Response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔔 MTW Hook Debug - Received data:', data);
        console.log('🔔 MTW Hook Debug - Number of notifications:', data.length);
        setMissedTaskNotifications(data);
        setHasMissedTaskNotifications(data.length > 0);
      } else {
        throw new Error('Failed to fetch missed task notifications');
      }
    } catch (err) {
      console.error('Error fetching missed task notifications:', err);
      setError(err.message);
      setMissedTaskNotifications([]);
      setHasMissedTaskNotifications(false);
    } finally {
      setLoading(false);
    }
  };

  const updateDaysThreshold = (newDays) => {
    setDaysThreshold(newDays);
    fetchMissedTaskNotifications(newDays);
  };

  useEffect(() => {
    fetchMissedTaskNotifications();
    
    // Refresh missed task notifications every 2 hours
    const interval = setInterval(() => fetchMissedTaskNotifications(), 2 * 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user]);

  const refreshMissedTaskNotifications = () => {
    fetchMissedTaskNotifications();
  };

  return {
    missedTaskNotifications,
    hasMissedTaskNotifications,
    loading,
    error,
    daysThreshold,
    refreshMissedTaskNotifications,
    updateDaysThreshold
  };
};
