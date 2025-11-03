import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function Errors() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ employee_id: '', task_id: '', severity: 'High', description: '', error_date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedErrors, setSelectedErrors] = useState([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchInitial = async () => {
      // Prepare headers with user permissions for the tasks request
      const tasksHeaders = {};
      if (user) {
        tasksHeaders['user-role'] = user.role || 'employee';
        tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
        tasksHeaders['user-name'] = user.name || '';
      }
      
      const [empRes, taskRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/tasks', { headers: tasksHeaders })
      ]);
      if (empRes.ok) {
        const empData = await empRes.json();
        // Handle both paginated and non-paginated responses
        setEmployees(Array.isArray(empData.data) ? empData.data : (Array.isArray(empData) ? empData : []));
      }
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        // Handle both paginated and non-paginated responses
        setTasks(Array.isArray(taskData.data) ? taskData.data : (Array.isArray(taskData) ? taskData : []));
      }
    };
    
    if (user) {
      fetchInitial();
    }
    fetch('/api/errors').then(r=>r.ok?r.json():[]).then(setErrors).catch(()=>{});
  }, [user]);

  const filteredTasks = useMemo(() => {
    if (!form.employee_id) return [];
    const employee = (employees || []).find(e => String(e.id) === String(form.employee_id));
    if (!employee) return [];
    const name = employee.name;
    return (tasks || []).filter(t => t.assigned_to && t.assigned_to.includes(name));
  }, [form.employee_id, employees, tasks]);

  const displayedErrors = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return errors;
    return errors.filter(e => (e.employee_name || '').toLowerCase().includes(q));
  }, [errors, searchTerm]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.task_id || !form.description.trim()) return alert('All fields are required.');
    setSubmitting(true);
    try {
      const res = await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setForm({ employee_id: '', task_id: '', severity: 'High', description: '', error_date: '' });
      setErrors(prev => [data.item, ...prev]);
      alert('Saved');
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle individual delete
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this error record?')) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`/api/errors/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setErrors(prev => prev.filter(error => error.id !== id));
        setSelectedErrors(prev => prev.filter(selectedId => selectedId !== id));
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting record');
      }
    } catch (error) {
      console.error('Error deleting error:', error);
      alert('Error deleting record');
    } finally {
      setDeleting(false);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedErrors.length === 0) {
      alert('Please select errors to delete');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedErrors.length} error record(s)?`)) return;
    
    setDeleting(true);
    try {
      const response = await fetch('/api/errors/bulk', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedErrors }),
      });
      
      if (response.ok) {
        const result = await response.json();
        setErrors(prev => prev.filter(error => !selectedErrors.includes(error.id)));
        setSelectedErrors([]);
        alert(result.message);
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting records');
      }
    } catch (error) {
      console.error('Error bulk deleting errors:', error);
      alert('Error deleting records');
    } finally {
      setDeleting(false);
    }
  };

  // Handle individual checkbox change
  const handleSelectError = (errorId) => {
    setSelectedErrors(prev => {
      const newSelected = prev.includes(errorId)
        ? prev.filter(id => id !== errorId)
        : [...prev, errorId];
      return newSelected;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = () => {
    const allDisplayedIds = displayedErrors.map(error => error.id);
    const allSelected = allDisplayedIds.every(id => selectedErrors.includes(id));
    
    if (allSelected) {
      setSelectedErrors(prev => prev.filter(id => !allDisplayedIds.includes(id)));
    } else {
      setSelectedErrors(prev => [...new Set([...prev, ...allDisplayedIds])]);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Employee Errors</h1>
      </div>

      <form onSubmit={submit} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee *</label>
            <select 
              value={form.employee_id} 
              onChange={e=>setForm(f=>({...f, employee_id: e.target.value, task_id: ''}))} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="">Select Employee...</option>
              {(employees || []).map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Task *</label>
            <select 
              value={form.task_id} 
              onChange={e=>setForm(f=>({...f, task_id: e.target.value}))} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100" 
              disabled={!form.employee_id}
              required
            >
              <option value="">Select Task...</option>
              {filteredTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            {!form.employee_id && (
              <p className="text-xs text-gray-500 mt-1">Please select an employee first</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Error Date</label>
            <input 
              type="date" 
              value={form.error_date} 
              onChange={e=>setForm(f=>({...f, error_date: e.target.value}))} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severity *</label>
            <select 
              value={form.severity} 
              onChange={e=>setForm(f=>({...f, severity: e.target.value}))} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
          <textarea 
            value={form.description} 
            onChange={e=>setForm(f=>({...f, description: e.target.value}))} 
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
            rows={4} 
            placeholder="Describe the error in detail..."
            required
          />
        </div>
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={submitting} 
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {submitting ? 'Saving...' : 'Save Error'}
          </button>
        </div>
      </form>

      <div className="mt-8 bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-gray-900">Error Records</h2>
            {selectedErrors.length > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : `Delete Selected (${selectedErrors.length})`}
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Search by employee..."
            value={searchTerm}
            onChange={(e)=>setSearchTerm(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 w-64 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={displayedErrors.length > 0 && displayedErrors.every(error => selectedErrors.includes(error.id))}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Error Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedErrors.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    No error records found
                  </td>
                </tr>
              ) : (
                displayedErrors.map(err => (
                  <tr key={err.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedErrors.includes(err.id)}
                        onChange={() => handleSelectError(err.id)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{err.employee_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{err.task_title}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        err.severity === 'High' ? 'bg-red-100 text-red-800' :
                        err.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {err.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={err.description}>{err.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{err.error_date ? new Date(err.error_date).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(err.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDelete(err.id)}
                        disabled={deleting}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete error"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


