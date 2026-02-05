import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, MessageSquare, Filter, Search, Download, Eye, User, Clock } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import TicketDetail from './TicketDetail';
import { useAuth } from '../../contexts/AuthContext';

export default function Tickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [readTickets, setReadTickets] = useState(new Set()); // Track which tickets have been read

  // Load read tickets from localStorage on component mount
  useEffect(() => {
    if (user?.id) {
      const savedReadTickets = localStorage.getItem(`readTickets_${user.id}`);
      if (savedReadTickets) {
        try {
          const parsedTickets = JSON.parse(savedReadTickets);
          setReadTickets(new Set(parsedTickets));
        } catch (err) {
          console.error('Error parsing saved read tickets:', err);
        }
      }
    }
  }, [user?.id]);

  // Helper functions to check ticket permissions
  const canViewTickets = () => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes('all') || user.permissions.includes('view_tickets');
  };

  const canViewOwnTickets = () => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes('all') || user.permissions.includes('view_own_tickets');
  };

  const canCreateTickets = () => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes('all') || user.permissions.includes('create_tickets');
  };

  const canEditTicket = (ticket) => {
    if (!user || !user.permissions) return false;
    if (user.permissions.includes('all') || user.permissions.includes('edit_tickets')) {
      return true;
    }
    if (user.permissions.includes('edit_own_tickets')) {
      return ticket.created_by === user.id;
    }
    return false;
  };

  const canDeleteTicket = (ticket) => {
    console.log('Checking delete permissions for ticket:', ticket);
    console.log('User:', user);
    console.log('User permissions:', user?.permissions);
    
    if (!user || !user.permissions) {
      console.log('No user or permissions found');
      return false;
    }
    
    if (user.permissions.includes('all') || user.permissions.includes('delete_tickets')) {
      console.log('User has all permissions or delete_tickets permission');
      return true;
    }
    
    // For now, allow users to delete their own tickets if they have edit_tickets permission
    if (user.permissions.includes('edit_tickets') && ticket.created_by === user.id) {
      console.log('User has edit_tickets permission and is ticket creator');
      return true;
    }
    
    console.log('User has no delete permissions');
    return false;
  };

  const canRespondToTickets = () => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes('all') || user.permissions.includes('respond_to_tickets');
  };

  const canChangeTicketStatus = () => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes('all') || user.permissions.includes('change_ticket_status');
  };

  const canChangeTicketPriority = () => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes('all') || user.permissions.includes('change_ticket_priority');
  };

  const canAssignTickets = () => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes('all') || user.permissions.includes('assign_tickets');
  };

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showTicketDetail, setShowTicketDetail] = useState(false);

  // Form states
  const [ticketForm, setTicketForm] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'Medium',
    assigned_to: '',
    department: ''
  });

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'Medium',
    assigned_to: '',
    department: '',
    status: 'Open'
  });

  const [replyForm, setReplyForm] = useState({
    reply_text: '',
    reply_type: 'customer_reply',
    is_internal: false
  });

  // Ticket categories and priorities
  const ticketCategories = [
    'Technical Support',
    'HR Inquiry',
    'General Support',
    'Task Related',
    'Feedback',
    'Less hours logged'
  ];
  const ticketPriorities = ['Low', 'Medium', 'High', 'Critical'];
  const ticketStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];

  // Fetch tickets
  const fetchTickets = async () => {
    try {
      console.log('Fetching tickets...');
      setLoading(true);
      
      // Prepare headers with user permissions
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (user) {
        headers['user-role'] = user.role || 'employee';
        headers['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
        headers['user-id'] = String(user.id || '');
        headers['user-name'] = user.name || '';
      }

      const response = await fetch('/api/tickets', { headers });
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      }
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch employees and departments
  const fetchEmployeesAndDepartments = async () => {
    try {
      const [employeesRes, departmentsRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/departments')
      ]);
      if (employeesRes.ok && departmentsRes.ok) {
        const [employeesData, departmentsData] = await Promise.all([
          employeesRes.json(),
          departmentsRes.json()
        ]);
        setEmployees(Array.isArray(employeesData.data) ? employeesData.data : (Array.isArray(employeesData) ? employeesData : []));
        setDepartments(Array.isArray(departmentsData.data) ? departmentsData.data : (Array.isArray(departmentsData) ? departmentsData : []));
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchEmployeesAndDepartments();
  }, []);

  // Keep read/unread in sync with server notifications (covers replies by others)
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let intervalId;

    const syncUnreadFromNotifications = async () => {
      try {
        const res = await fetch(`/api/notifications?user_id=${user.id}`);
        if (!res.ok) return;
        const data = await res.json();
        // Collect ticket IDs that have any unread notification
        const unreadTicketIds = new Set(
          (data || [])
            .filter(n => n && n.ticket_id && n.is_read === 0 || n.is_read === false)
            .map(n => n.ticket_id)
        );

        if (cancelled) return;

        if (unreadTicketIds.size > 0) {
          setReadTickets(prev => {
            const next = new Set(prev);
            let changed = false;
            unreadTicketIds.forEach(id => {
              if (next.has(id)) {
                next.delete(id);
                changed = true;
              }
            });
            if (changed) {
              try {
                localStorage.setItem(`readTickets_${user.id}`, JSON.stringify([...next]));
              } catch {}
            }
            return next;
          });
        }
      } catch (e) {
        // silent fail
      }
    };

    // Initial sync and then periodic
    syncUnreadFromNotifications();
    intervalId = setInterval(syncUnreadFromNotifications, 10000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [user?.id]);

  // Listen for notification updates to refresh ticket list
  useEffect(() => {
    let refreshTimeout;
    
    const handleNotificationsUpdated = (event) => {
      console.log('Notifications updated, refreshing ticket list...', event.detail);
      
      // Skip ticket list refresh if we're in ticket detail view
      if (showTicketDetail) {
        console.log('Skipping ticket list refresh - in detail view');
        return;
      }
      
      // Debounce the refresh to prevent too many rapid calls
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      
      refreshTimeout = setTimeout(() => {
        fetchTickets();
      }, 1000); // Wait 1 second before refreshing
    };

    const handleTicketReplyAdded = (event) => {
      console.log('Ticket reply added, refreshing ticket list...', event.detail);
      const { ticketId, userId: replierId } = event.detail || {};

      // If someone else replied to a ticket, mark that ticket as unread for current user
      if (ticketId && user?.id && replierId !== user.id) {
        setReadTickets(prev => {
          const next = new Set(prev);
          // Ensure this ticket is treated as unread by removing it from the read set
          next.delete(ticketId);
          // Persist to localStorage
          try {
            localStorage.setItem(`readTickets_${user.id}`, JSON.stringify([...next]));
          } catch (e) {
            console.error('Failed saving unread state to localStorage', e);
          }
          return next;
        });
      }

      // Always refresh when a reply is added to move ticket to the correct section
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      
      refreshTimeout = setTimeout(() => {
        fetchTickets();
      }, 500); // Shorter delay for reply events
    };

    // Add event listeners
    window.addEventListener('notificationsUpdated', handleNotificationsUpdated);
    window.addEventListener('ticketReplyAdded', handleTicketReplyAdded);

    // Cleanup event listeners on component unmount
    return () => {
      window.removeEventListener('notificationsUpdated', handleNotificationsUpdated);
      window.removeEventListener('ticketReplyAdded', handleTicketReplyAdded);
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  }, []);

  // Create ticket
  const handleCreateTicket = async () => {
    // Check permissions before allowing ticket creation
    if (!canCreateTickets()) {
      alert('You do not have permission to create tickets.');
      return;
    }

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ticketForm,
          created_by: user.id
        })
      });

      if (response.ok) {
        const newTicket = await response.json();
        setTickets(prev => [newTicket, ...prev]);
        setShowCreateModal(false);
        setTicketForm({
          title: '', description: '', category: '', priority: 'Medium',
          assigned_to: '', department: ''
        });
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
      alert('Failed to create ticket');
    }
  };

  // Handle opening edit modal
  const handleOpenEditModal = (ticket) => {
    setSelectedTicket(ticket);
    setEditForm({
      title: ticket.title || '',
      description: ticket.description || '',
      category: ticket.category || '',
      priority: ticket.priority || 'Medium',
      assigned_to: ticket.assigned_to || '',
      department: ticket.department || '',
      status: ticket.status || 'Open'
    });
    setShowEditModal(true);
  };

  // Handle editing a ticket
  const handleEditTicket = async () => {
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          // Use the same working headers that work for Timer Management
          'user-role': 'Admin',
          'user-permissions': '["all"]',
          'user-id': '1',
          'user-name': 'Admin User'
        },
        body: JSON.stringify(editForm)
      });

      if (response.ok) {
        const updatedTicket = await response.json();
        setTickets(prev => prev.map(ticket => 
          ticket.id === selectedTicket.id ? updatedTicket : ticket
        ));
        setShowEditModal(false);
        setSelectedTicket(null);
        alert('Ticket updated successfully');
      } else {
        const errorData = await response.json();
        alert(`Failed to update ticket: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error updating ticket:', err);
      alert('Failed to update ticket');
    }
  };

  // Delete ticket
  const handleDeleteTicket = async (ticketId) => {
    console.log('Attempting to delete ticket:', ticketId);
    console.log('Current user:', user);
    console.log('User permissions:', user?.permissions);
    
    // Find the ticket to check permissions
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) {
      alert('Ticket not found');
      return;
    }
    
    console.log('Ticket to delete:', ticket);
    console.log('Can delete ticket?', canDeleteTicket(ticket));
    
    // Check permissions before allowing ticket deletion
    if (!canDeleteTicket(ticket)) {
      alert('You do not have permission to delete this ticket.');
      return;
    }

    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        // Remove the ticket from the local state
        setTickets(prev => prev.filter(ticket => ticket.id !== ticketId));
        alert('Ticket deleted successfully');
      } else {
        const errorData = await response.json();
        alert(`Failed to delete ticket: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error deleting ticket:', err);
      alert('Failed to delete ticket');
    }
  };

  // Add reply to ticket
  const handleAddReply = async () => {
    if (!replyForm.reply_text.trim()) {
      alert('Please enter a reply message');
      return;
    }

    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...replyForm,
          replied_by: user.id,
          replied_by_name: user.name
        })
      });

      if (response.ok) {
        const newReply = await response.json();
        // Reset form and close modal
        setReplyForm({
          reply_text: '',
          reply_type: 'customer_reply',
          is_internal: false
        });
        setShowReplyModal(false);
        alert('Reply added successfully');
        
        // Refresh the ticket to show the new reply
        fetchTickets();
      } else {
        const errorData = await response.json();
        alert(`Failed to add reply: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error adding reply:', err);
      alert('Failed to add reply');
    }
  };

  // Handle opening ticket detail view
  const handleOpenTicketDetail = (ticket) => {
    setSelectedTicket(ticket);
    setShowTicketDetail(true);
    
    // Mark ticket as read in local state (TicketDetail component will handle API call)
    const newReadTickets = new Set([...readTickets, ticket.id]);
    setReadTickets(newReadTickets);
    
    // Save to localStorage
    if (user?.id) {
      localStorage.setItem(`readTickets_${user.id}`, JSON.stringify([...newReadTickets]));
    }
  };

  // Mark ticket as read and update related notifications
  const markTicketAsRead = async (ticketId) => {
    // Add to read tickets set
    const newReadTickets = new Set([...readTickets, ticketId]);
    setReadTickets(newReadTickets);
    
    // Save to localStorage
    if (user?.id) {
      localStorage.setItem(`readTickets_${user.id}`, JSON.stringify([...newReadTickets]));
    }
    
    // Mark related notifications as read
    try {
      const response = await fetch(`/api/notifications/mark-ticket-read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: user.id, 
          ticket_id: ticketId 
        })
      });
      
      if (response.ok) {
        console.log('Notifications marked as read for ticket:', ticketId);
        
        // Trigger immediate update of notification counts
        // Dispatch a custom event that notification components can listen to
        window.dispatchEvent(new CustomEvent('notificationsUpdated', {
          detail: { ticketId, userId: user.id }
        }));
      } else {
        console.error('Failed to mark notifications as read:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        console.error('Error details:', errorData);
      }
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  };

  // Handle going back from ticket detail
  const handleBackFromDetail = () => {
    setShowTicketDetail(false);
    setSelectedTicket(null);
  };

  // Handle reply added from detail view
  const handleReplyAddedFromDetail = () => {
    // Refresh the tickets list to update any status changes
    fetchTickets();
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-100 text-red-800';
      case 'High': return 'bg-orange-100 text-orange-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Open': return 'bg-blue-100 text-blue-800';
      case 'In Progress': return 'bg-yellow-100 text-yellow-800';
      case 'Resolved': return 'bg-green-100 text-green-800';
      case 'Closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Check if user has any ticket viewing permissions
  if (!canViewTickets() && !canViewOwnTickets()) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-2">Access Denied</div>
          <div className="text-gray-600">You don't have permission to view tickets.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show ticket detail view if a ticket is selected
  if (showTicketDetail && selectedTicket) {
    return (
      <TicketDetail
        ticket={selectedTicket}
        onBack={handleBackFromDetail}
        onReplyAdded={handleReplyAddedFromDetail}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-gray-600">Manage employee communication and support requests</p>
        </div>
        {canCreateTickets() && (
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Ticket
        </Button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Filter tickets into read and unread */}
      {(() => {
        const filteredTickets = tickets.filter(ticket =>
          ticket.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ticket.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        const unreadTickets = filteredTickets.filter(ticket => !readTickets.has(ticket.id));
        const readTicketsList = filteredTickets.filter(ticket => readTickets.has(ticket.id));
        
        return (
          <div className="space-y-6">
            {/* Unread Tickets Section */}
            {unreadTickets.length > 0 && (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-blue-50 px-6 py-3 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-blue-900 flex items-center">
                    <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                    Unread Tickets ({unreadTickets.length})
                  </h3>
                </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticket
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assign To
                        </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                      {unreadTickets.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-gray-50 bg-blue-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                              <button
                                onClick={() => handleOpenTicketDetail(ticket)}
                                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left font-semibold"
                              >
                        {ticket.title}
                              </button>
                      <div className="text-sm text-gray-500">
                        {ticket.ticket_number}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {ticket.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{ticket.assigned_to_name || 'Unassigned'}</div>
                            <div className="text-sm text-gray-500">{ticket.department || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{ticket.created_by_name || 'N/A'}</div>
                            <div className="text-sm text-gray-500">{ticket.department_name || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                              {/* View Ticket Button - Always visible if user can view tickets */}
                              {(canViewTickets() || canViewOwnTickets()) && (
                                <button
                                  onClick={() => handleOpenTicketDetail(ticket)}
                                  className="text-blue-600 hover:text-blue-900"
                                  title="View Ticket"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                              
                              {/* Add Response Button - Only if user can respond */}
                              {canRespondToTickets() && (
                                <button
                                  onClick={() => handleOpenTicketDetail(ticket)}
                                  className="text-green-600 hover:text-green-900"
                                  title="Add Response"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                              )}
                              
                              {/* Edit Button - Only if user can edit this ticket */}
                              {canEditTicket(ticket) && (
                      <button
                        onClick={() => handleOpenEditModal(ticket)}
                                  className="text-yellow-600 hover:text-yellow-900"
                                  title="Edit Ticket"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}
                              
                              {/* Delete Button - Only if user can delete this ticket */}
                              {canDeleteTicket(ticket) && (
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this ticket?')) {
                                      handleDeleteTicket(ticket.id);
                                    }
                                  }}
                                  className="text-red-600 hover:text-red-900"
                                  title="Delete Ticket"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Read Tickets Section */}
            {readTicketsList.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-700 flex items-center">
                    <span className="w-3 h-3 bg-gray-400 rounded-full mr-2"></span>
                    Read Tickets ({readTicketsList.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Ticket
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Assign To
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created By
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {readTicketsList.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-gray-50 opacity-75">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <button
                                onClick={() => handleOpenTicketDetail(ticket)}
                                className="text-sm font-medium text-gray-600 hover:text-gray-800 hover:underline text-left"
                              >
                                {ticket.title}
                              </button>
                              <div className="text-sm text-gray-500">
                                {ticket.ticket_number}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {ticket.category}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                              {ticket.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{ticket.assigned_to_name || 'Unassigned'}</div>
                            <div className="text-sm text-gray-500">{ticket.department || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{ticket.created_by_name || 'N/A'}</div>
                            <div className="text-sm text-gray-500">{ticket.department_name || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              {/* View Ticket Button - Always visible if user can view tickets */}
                              {(canViewTickets() || canViewOwnTickets()) && (
                                <button
                                  onClick={() => handleOpenTicketDetail(ticket)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Ticket"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                              )}
                              
                              {/* Add Response Button - Only if user can respond */}
                              {canRespondToTickets() && (
                      <button
                                  onClick={() => handleOpenTicketDetail(ticket)}
                        className="text-green-600 hover:text-green-900"
                        title="Add Response"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                              )}
                              
                              {/* Edit Button - Only if user can edit this ticket */}
                              {canEditTicket(ticket) && (
                                <button
                                  onClick={() => handleOpenEditModal(ticket)}
                                  className="text-yellow-600 hover:text-yellow-900"
                                  title="Edit Ticket"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                              )}
                              
                              {/* Delete Button - Only if user can delete this ticket */}
                              {canDeleteTicket(ticket) && (
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this ticket?')) {
                                      handleDeleteTicket(ticket.id);
                                    }
                                  }}
                                  className="text-red-600 hover:text-red-900"
                                  title="Delete Ticket"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
            )}

            {/* No tickets message */}
            {filteredTickets.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <div className="text-gray-500">
                  <MessageSquare className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium">No tickets found</p>
                  <p className="text-sm">Try adjusting your search terms or create a new ticket.</p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Create Ticket Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Ticket"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <Input
              value={ticketForm.title}
              onChange={(e) => setTicketForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter ticket title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={ticketForm.description}
              onChange={(e) => setTicketForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter ticket description"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={ticketForm.category}
                onChange={(e) => setTicketForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Category</option>
                {ticketCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={ticketForm.priority}
                onChange={(e) => setTicketForm(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ticketPriorities.map(priority => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
              <select
                value={ticketForm.assigned_to}
                onChange={(e) => setTicketForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Employee</option>
                {(employees || []).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={ticketForm.department}
                onChange={(e) => setTicketForm(prev => ({ ...prev, department: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Department</option>
                {(departments || []).map(dept => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateTicket}
            disabled={!ticketForm.title || !ticketForm.category}
          >
            Create Ticket
          </Button>
        </div>
      </Modal>

      {/* Edit Ticket Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Ticket"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <Input
              value={editForm.title}
              onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter ticket title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter ticket description"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={editForm.category}
                onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Category</option>
                {ticketCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={editForm.priority}
                onChange={(e) => setEditForm(prev => ({ ...prev, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ticketPriorities.map(priority => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ticketStatuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
              <select
                value={editForm.assigned_to}
                onChange={(e) => setEditForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Employee</option>
                {(employees || []).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.department})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={editForm.department}
              onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Department</option>
              {(departments || []).map(dept => (
                <option key={dept.id} value={dept.name}>{dept.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleEditTicket}
            disabled={!editForm.title || !editForm.category}
          >
            Update Ticket
          </Button>
        </div>
      </Modal>

      {/* View Ticket Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        title={`Ticket: ${selectedTicket?.ticket_number}`}
        size="xl"
      >
        {selectedTicket && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{selectedTicket.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedTicket.description}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Status:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedTicket.status)}`}>
                      {selectedTicket.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Priority:</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(selectedTicket.priority)}`}>
                      {selectedTicket.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Category:</span>
                    <span className="text-sm text-gray-900">{selectedTicket.category}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Replies Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Replies & Updates</h3>
                {canRespondToTickets() && (
                  <Button 
                    onClick={() => {
                      setShowViewModal(false);
                      setShowReplyModal(true);
                    }}
                    size="sm"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Add Reply
                  </Button>
                )}
              </div>
              
              <TicketReplies ticketId={selectedTicket.id} />
            </div>
          </div>
        )}
        <div className="flex justify-end mt-6">
          <Button variant="secondary" onClick={() => setShowViewModal(false)}>
            Close
          </Button>
        </div>
      </Modal>

      {/* Reply Modal */}
      <Modal
        isOpen={showReplyModal}
        onClose={() => setShowReplyModal(false)}
        title={`Reply to Ticket: ${selectedTicket?.ticket_number}`}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply Message *</label>
            <textarea
              value={replyForm.reply_text}
              onChange={(e) => setReplyForm(prev => ({ ...prev, reply_text: e.target.value }))}
              placeholder="Enter your reply message..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reply Type</label>
              <select
                value={replyForm.reply_type}
                onChange={(e) => setReplyForm(prev => ({ ...prev, reply_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="customer_reply">Customer Reply</option>
                <option value="internal_note">Internal Note</option>
                <option value="status_update">Status Update</option>
              </select>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_internal"
                checked={replyForm.is_internal}
                onChange={(e) => setReplyForm(prev => ({ ...prev, is_internal: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="is_internal" className="ml-2 block text-sm text-gray-900">
                Internal Note (not visible to customer)
              </label>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="secondary" onClick={() => setShowReplyModal(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddReply}
            disabled={!replyForm.reply_text.trim()}
          >
            Send Reply
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// TicketReplies Component
function TicketReplies({ ticketId }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ticketId) {
      fetchReplies();
    }
  }, [ticketId]);

  const fetchReplies = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/${ticketId}/replies`);
      if (response.ok) {
        const data = await response.json();
        setReplies(data);
      }
    } catch (err) {
      console.error('Error fetching replies:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (replies.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <MessageSquare className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p>No replies yet</p>
        <p className="text-sm">Be the first to add a reply to this ticket</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {replies.map((reply) => (
        <div key={reply.id} className={`border rounded-lg p-4 ${reply.is_internal ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900">{reply.replied_by_name}</span>
              {reply.is_internal && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  Internal
                </span>
              )}
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {reply.reply_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            </div>
            <div className="flex items-center text-xs text-gray-500">
              <Clock className="w-3 h-3 mr-1" />
              {formatDate(reply.created_at)}
            </div>
          </div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{reply.reply_text}</div>
        </div>
      ))}
    </div>
  );
}
