import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useAbsenceNotifications = () => {
  const { user } = useAuth();
  const [absenceNotifications, setAbsenceNotifications] = useState([]);
  const [hasAbsenceNotifications, setHasAbsenceNotifications] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAbsenceNotifications = async () => {
    console.log('🔔 CA Hook Debug - Starting fetchAbsenceNotifications');
    console.log('🔔 CA Hook Debug - User:', user);
    console.log('🔔 CA Hook Debug - User permissions:', user?.permissions);
    console.log('🔔 CA Hook Debug - User role:', user?.role);
    
    // Check if user has ca_view permission
    if (!user?.permissions?.includes('ca_view') && !user?.permissions?.includes('all') && user?.role !== 'admin' && user?.role !== 'Admin') {
      console.log('🔔 CA Hook Debug - User does not have CA permissions, returning empty array');
      setAbsenceNotifications([]);
      setHasAbsenceNotifications(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('🔔 CA Hook Debug - Making API request to consecutive-absences');

      const response = await fetch('/api/notifications/consecutive-absences', {
        headers: {
          'x-user-role': 'Admin',
          'x-user-permissions': '["all"]'
        }
      });
      
      console.log('🔔 CA Hook Debug - Response status:', response.status);
      console.log('🔔 CA Hook Debug - Response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔔 CA Hook Debug - Received data:', data);
        console.log('🔔 CA Hook Debug - Number of notifications:', data.length);
        setAbsenceNotifications(data);
        setHasAbsenceNotifications(data.length > 0);
      } else {
        throw new Error('Failed to fetch absence notifications');
      }
    } catch (err) {
      console.error('Error fetching absence notifications:', err);
      setError(err.message);
      setAbsenceNotifications([]);
      setHasAbsenceNotifications(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAbsenceNotifications();
    
    // Refresh absence notifications every 4 hours (since we're tracking by days, not real-time)
    const interval = setInterval(fetchAbsenceNotifications, 4 * 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [user]);

  const refreshAbsenceNotifications = () => {
    fetchAbsenceNotifications();
  };

  return {
    absenceNotifications,
    hasAbsenceNotifications,
    loading,
    error,
    refreshAbsenceNotifications
  };
};


