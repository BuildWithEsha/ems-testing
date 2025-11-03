import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useLessTrainedEmployeeNotifications = () => {
  const { user } = useAuth();
  const [lessTrainedEmployeeNotifications, setLessTrainedEmployeeNotifications] = useState([]);
  const [hasLessTrainedEmployeeNotifications, setHasLessTrainedEmployeeNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [minTrainedThreshold, setMinTrainedThreshold] = useState(3); // Default 3 employees

  const fetchLessTrainedEmployeeNotifications = async (minTrained = minTrainedThreshold) => {
    console.log('🔔 LTE Hook Debug - Starting fetchLessTrainedEmployeeNotifications');
    console.log('🔔 LTE Hook Debug - User:', user);
    console.log('🔔 LTE Hook Debug - User permissions:', user?.permissions);
    console.log('🔔 LTE Hook Debug - User role:', user?.role);
    console.log('🔔 LTE Hook Debug - Min trained threshold:', minTrained);
    
    // Check if user has lte_view permission
    if (!user?.permissions?.includes('lte_view') && !user?.permissions?.includes('all') && user?.role !== 'admin' && user?.role !== 'Admin') {
      console.log('🔔 LTE Hook Debug - User does not have LTE permissions, returning empty array');
      setLessTrainedEmployeeNotifications([]);
      setHasLessTrainedEmployeeNotifications(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('🔔 LTE Hook Debug - Making API request to less-trained-employees');

      const response = await fetch(`/api/notifications/less-trained-employees?minTrained=${minTrained}`, {
        headers: {
          'x-user-role': 'Admin',
          'x-user-permissions': '["all"]'
        }
      });
      
      console.log('🔔 LTE Hook Debug - Response status:', response.status);
      console.log('🔔 LTE Hook Debug - Response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔔 LTE Hook Debug - Received data:', data);
        console.log('🔔 LTE Hook Debug - Number of notifications:', data.length);
        setLessTrainedEmployeeNotifications(data);
        setHasLessTrainedEmployeeNotifications(data.length > 0);
      } else {
        throw new Error('Failed to fetch less trained employee notifications');
      }
    } catch (err) {
      console.error('Error fetching less trained employee notifications:', err);
      setError(err.message);
      setLessTrainedEmployeeNotifications([]);
      setHasLessTrainedEmployeeNotifications(false);
    } finally {
      setLoading(false);
    }
  };

  const updateMinTrainedThreshold = (newMinTrained) => {
    setMinTrainedThreshold(newMinTrained);
    fetchLessTrainedEmployeeNotifications(newMinTrained);
  };

  useEffect(() => {
    fetchLessTrainedEmployeeNotifications();
    
    // Refresh less trained employee notifications every 2 hours
    const interval = setInterval(() => fetchLessTrainedEmployeeNotifications(), 2 * 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user]);

  const refreshLessTrainedEmployeeNotifications = () => {
    fetchLessTrainedEmployeeNotifications();
  };

  return {
    lessTrainedEmployeeNotifications,
    hasLessTrainedEmployeeNotifications,
    loading,
    error,
    minTrainedThreshold,
    refreshLessTrainedEmployeeNotifications,
    updateMinTrainedThreshold
  };
};
