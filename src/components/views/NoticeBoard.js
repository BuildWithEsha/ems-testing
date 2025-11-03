import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2, 
  Download,
  Calendar,
  User,
  Building,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Paperclip,
  Megaphone
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import MultiSelect from '../ui/MultiSelect';

const NoticeBoard = () => {
  const { user } = useAuth();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);

  // Fetch notices and related data
  useEffect(() => {
    if (user?.id) {
      fetchNotices();
      fetchEmployees();
      fetchDepartments();
    }
  }, [user?.id]);

  const fetchNotices = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/notices?user_id=${user.id}&user_role=${user.role || user.user_role || 'employee'}`);
      if (response.ok) {
        const data = await response.json();
        setNotices(data);
      }
    } catch (error) {
      console.error('Error fetching notices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees');
      if (response.ok) {
        const data = await response.json();
        // Handle both paginated and non-paginated responses
        setEmployees(data.data || data);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments');
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  // Filter notices based on search and filters
  const filteredNotices = notices.filter(notice => {
    const matchesSearch = notice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         notice.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || notice.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || notice.priority === filterPriority;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'published': return 'text-green-600 bg-green-50';
      case 'draft': return 'text-yellow-600 bg-yellow-50';
      case 'archived': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDeleteNotice = async (noticeId) => {
    if (window.confirm('Are you sure you want to delete this notice?')) {
      try {
        const response = await fetch(`/api/notices/${noticeId}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          setNotices(notices.filter(notice => notice.id !== noticeId));
        }
      } catch (error) {
        console.error('Error deleting notice:', error);
      }
    }
  };

  const handleMarkAsRead = async (noticeId) => {
    try {
      const response = await fetch(`/api/notices/${noticeId}/mark-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: user.id })
      });
      if (response.ok) {
        fetchNotices(); // Refresh to get updated read status
      }
    } catch (error) {
      console.error('Error marking notice as read:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notice Board</h1>
          <p className="text-gray-600">Manage and view company notices</p>
        </div>
        <Button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Notice</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search notices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Notices List */}
      <div className="space-y-4">
        {filteredNotices.length === 0 ? (
          <div className="text-center py-12">
            <Megaphone className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No notices found</h3>
            <p className="text-gray-500">Create your first notice to get started.</p>
          </div>
        ) : (
          filteredNotices.map((notice) => (
            <div key={notice.id} className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{notice.title}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(notice.priority)}`}>
                        {notice.priority}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(notice.status)}`}>
                        {notice.status}
                      </span>
                    </div>
                    
                    <p className="text-gray-600 mb-4 line-clamp-3">{notice.description}</p>
                    
                    <div className="flex items-center space-x-6 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(notice.created_at)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <User className="w-4 h-4" />
                        <span>By {notice.created_by_name}</span>
                      </div>
                      {notice.attachments && notice.attachments.length > 0 && (
                        <div className="flex items-center space-x-1">
                          <Paperclip className="w-4 h-4" />
                          <span>{notice.attachments.length} attachment(s)</span>
                        </div>
                      )}
                    </div>

                    {/* Recipients */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {notice.recipients && notice.recipients.map((recipient, index) => (
                        <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
                          {recipient.type === 'employee' ? (
                            <>
                              <User className="w-3 h-3 mr-1" />
                              {recipient.name}
                            </>
                          ) : (
                            <>
                              <Building className="w-3 h-3 mr-1" />
                              {recipient.name}
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    {!notice.is_read && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleMarkAsRead(notice.id)}
                        className="flex items-center space-x-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Mark Read</span>
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingNotice(notice)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {user.role === 'admin' && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditingNotice(notice)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDeleteNotice(notice.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Notice Modal */}
      <AddNoticeModal
        isOpen={showAddModal || !!editingNotice}
        onClose={() => {
          setShowAddModal(false);
          setEditingNotice(null);
        }}
        notice={editingNotice}
        employees={employees}
        departments={departments}
        onSave={() => {
          fetchNotices();
          setShowAddModal(false);
          setEditingNotice(null);
        }}
      />
    </div>
  );
};

// Add Notice Modal Component
const AddNoticeModal = ({ isOpen, onClose, notice, employees, departments, onSave }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'draft',
    selectedDepartments: [],
    recipients: [],
    attachments: []
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (notice) {
      setFormData({
        title: notice.title || '',
        description: notice.description || '',
        priority: notice.priority || 'medium',
        status: notice.status || 'draft',
        selectedDepartments: notice.selectedDepartments || [],
        recipients: notice.recipients || [],
        attachments: notice.attachments || []
      });
    } else {
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        status: 'draft',
        selectedDepartments: [],
        recipients: [],
        attachments: []
      });
    }
  }, [notice, isOpen]);

  // Handle department selection and auto-add employees
  const handleDepartmentChange = (selectedDeptIds) => {
    setFormData(prev => {
      const newSelectedDepartments = selectedDeptIds;
      
      // Get all employees from selected departments
      const deptEmployees = employees.filter(emp => 
        selectedDeptIds.includes(emp.department_id)
      );
      
      // Create recipient objects for department employees
      const deptRecipients = deptEmployees.map(emp => ({
        value: emp.id,
        label: emp.name,
        type: 'employee'
      }));
      
      // Get current individual recipients (not from departments)
      const currentIndividualRecipients = prev.recipients.filter(recipient => 
        !deptEmployees.some(emp => emp.id === recipient.value)
      );
      
      // Combine department employees with individual selections
      const allRecipients = [...deptRecipients, ...currentIndividualRecipients];
      
      return {
        ...prev,
        selectedDepartments: newSelectedDepartments,
        recipients: allRecipients
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const url = notice ? `/api/notices/${notice.id}` : '/api/notices';
      const method = notice ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          created_by: user.id
        })
      });

      if (response.ok) {
        onSave();
      } else {
        const errorData = await response.json();
        setErrors(errorData.errors || {});
      }
    } catch (error) {
      console.error('Error saving notice:', error);
      setErrors({ general: 'An error occurred while saving the notice' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('attachments', file);
    });

    try {
      const response = await fetch('/api/notices/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          attachments: [...prev.attachments, ...data.files]
        }));
      }
    } catch (error) {
      console.error('Error uploading files:', error);
    }
  };

  const employeeOptions = (employees || []).map(emp => ({
    value: emp.id,
    label: emp.name,
    type: 'employee'
  }));

  const departmentOptions = (departments || []).map(dept => ({
    value: dept.id,
    label: dept.name,
    type: 'department'
  }));

  const allOptions = [...employeeOptions, ...departmentOptions];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={notice ? 'Edit Notice' : 'Add New Notice'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notice Title *
          </label>
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Enter notice title"
            required
          />
          {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description *
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Enter notice description"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Priority
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Departments
          </label>
          <MultiSelect
            options={departmentOptions}
            value={formData.selectedDepartments}
            onChange={handleDepartmentChange}
            placeholder="Select departments (all employees will be automatically added)"
          />
          <p className="text-xs text-gray-500 mt-1">
            Selecting departments will automatically include all employees from those departments
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Individual Recipients
          </label>
          <MultiSelect
            options={employeeOptions}
            value={formData.recipients.filter(r => r.type === 'employee')}
            onChange={(selected) => {
              // Keep department employees and update individual selections
              const deptEmployees = employees.filter(emp => 
                formData.selectedDepartments.includes(emp.department_id)
              ).map(emp => ({
                value: emp.id,
                label: emp.name,
                type: 'employee'
              }));
              
              setFormData(prev => ({
                ...prev,
                recipients: [...deptEmployees, ...selected]
              }));
            }}
            placeholder="Select individual employees (optional)"
          />
          <p className="text-xs text-gray-500 mt-1">
            You can also select individual employees in addition to department selections
          </p>
          {errors.recipients && <p className="text-red-500 text-sm mt-1">{errors.recipients}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Attachments
          </label>
          <input
            type="file"
            multiple
            onChange={handleFileUpload}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {formData.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {formData.attachments.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                  <span className="text-sm text-gray-700">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      attachments: prev.attachments.filter((_, i) => i !== index)
                    }))}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {errors.general && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-600 text-sm">{errors.general}</p>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : (notice ? 'Update Notice' : 'Create Notice')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default NoticeBoard;
