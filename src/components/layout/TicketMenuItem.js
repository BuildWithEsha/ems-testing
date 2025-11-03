import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const TicketMenuItem = ({ currentView, onViewChange }) => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user?.id) {
      fetchUnreadCount();
      
      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 30000);
      
      // Listen for immediate notification updates
      const handleNotificationUpdate = (event) => {
        if (event.detail.userId === user.id) {
          // Immediately fetch updated counts
          fetchUnreadCount();
        }
      };
      
      window.addEventListener('notificationsUpdated', handleNotificationUpdate);
      
      return () => {
        clearInterval(interval);
        window.removeEventListener('notificationsUpdated', handleNotificationUpdate);
      };
    }
  }, [user?.id]);

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch(`/api/notifications/unread-count?user_id=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.unread_count);
      }
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  };

  const isActive = currentView === 'tickets';

  return (
    <button
      onClick={() => onViewChange('tickets')}
      className={`
        w-full flex items-center justify-between px-6 py-3 text-left transition-colors
        ${isActive 
          ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600' 
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
      `}
    >
      <div className="flex items-center">
        <MessageSquare className="w-5 h-5 mr-3" />
        Tickets
      </div>
      {unreadCount > 0 && (
        <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default TicketMenuItem;
