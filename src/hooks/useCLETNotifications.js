import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useCLETNotifications = () => {
  const { user } = useAuth();
  const [cletNotifications, setCletNotifications] = useState([]);
  const [hasCLETNotifications, setHasCLETNotifications] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCLETNotifications = async () => {
    // Check if user has clet_view permission
    if (!user?.permissions?.includes('clet_view') && !user?.permissions?.includes('all') && user?.role !== 'admin') {
      setCletNotifications([]);
      setHasCLETNotifications(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/clet-notifications', {
        headers: {
          'x-user-role': 'Admin',
          'x-user-permissions': '["all"]'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCletNotifications(data);
        setHasCLETNotifications(data.length > 0);
      } else {
        console.error('Failed to fetch CLET notifications:', response.status);
        setCletNotifications([]);
        setHasCLETNotifications(false);
      }
    } catch (error) {
      console.error('Error fetching CLET notifications:', error);
      setCletNotifications([]);
      setHasCLETNotifications(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCLETNotifications();
    
    // Poll for updates every 5 minutes
    const interval = setInterval(fetchCLETNotifications, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    cletNotifications,
    hasCLETNotifications,
    loading,
    refetch: fetchCLETNotifications
  };
};
