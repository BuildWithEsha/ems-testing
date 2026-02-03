import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Trash2, ChevronDown, Eye, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../ui/Modal';

export default function Errors() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [tasksForEmployee, setTasksForEmployee] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [form, setForm] = useState({ employee_id: '', task_id: '', severity: 'High', description: '', error_date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedErrors, setSelectedErrors] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [taskDropdownOpen, setTaskDropdownOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const employeeDropdownRef = useRef(null);
  const taskDropdownRef = useRef(null);
  const [viewingError, setViewingError] = useState(null);

  useEffect(() => {
    const fetchInitial = async () => {
      const empRes = await fetch('/api/employees');
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(Array.isArray(empData.data) ? empData.data : (Array.isArray(empData) ? empData : []));
      }
    };
    if (user) fetchInitial();
    fetch('/api/errors').then(r=>r.ok?r.json():[]).then(setErrors).catch(()=>{});
  }, [user]);

  // Fetch tasks for selected employee when employee changes
  useEffect(() => {
    if (!form.employee_id) {
      setTasksForEmployee([]);
      return;
    }
    const employee = (employees || []).find(e => String(e.id) === String(form.employee_id));
    if (!employee || !employee.name) {
      setTasksForEmployee([]);
      return;
    }
    const tasksHeaders = {};
    if (user) {
      tasksHeaders['user-role'] = user.role || 'employee';
      tasksHeaders['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
      tasksHeaders['user-name'] = user.name || '';
    }
    setTasksLoading(true);
    const params = new URLSearchParams({ employee: employee.name, limit: '500' });
    fetch(`/api/tasks?${params}`, { headers: tasksHeaders })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(taskData => {
        const list = Array.isArray(taskData.data) ? taskData.data : (Array.isArray(taskData) ? taskData : []);
        setTasksForEmployee(list);
      })
      .catch(() => setTasksForEmployee([]))
      .finally(() => setTasksLoading(false));
  }, [form.employee_id, employees, user]);

  const filteredEmployees = useMemo(() => {
    const q = (employeeSearch || '').trim().toLowerCase();
    if (!q) return (employees || []).slice(0, 100);
    return (employees || []).filter(e => (e.name || '').toLowerCase().includes(q));
  }, [employees, employeeSearch]);

  const selectedEmployeeName = useMemo(() => {
    if (!form.employee_id) return '';
    const e = (employees || []).find(emp => String(emp.id) === String(form.employee_id));
    return e ? e.name : '';
  }, [form.employee_id, employees]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target)) {
        setEmployeeDropdownOpen(false);
      }
      if (taskDropdownRef.current && !taskDropdownRef.current.contains(e.target)) {
        setTaskDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTasksForDropdown = useMemo(() => {
    const q = (taskSearch || '').trim().toLowerCase();
    if (!q) return tasksForEmployee;
    return tasksForEmployee.filter(t => (t.title || '').toLowerCase().includes(q));
  }, [tasksForEmployee, taskSearch]);

  const selectedTaskTitle = useMemo(() => {
    if (!form.task_id) return '';
    const t = tasksForEmployee.find(tk => String(tk.id) === String(form.task_id));
    return t ? t.title : '';
  }, [form.task_id, tasksForEmployee]);

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
      setEmployeeSearch('');
      setTasksForEmployee([]);
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
          <div ref={employeeDropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Employee *</label>
            <div className="relative">
              <input
                type="text"
                value={employeeDropdownOpen ? employeeSearch : selectedEmployeeName}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setEmployeeDropdownOpen(true);
                  if (!e.target.value) setForm(f => ({ ...f, employee_id: '', task_id: '' }));
                }}
                onFocus={() => {
                  setEmployeeDropdownOpen(true);
                  setEmployeeSearch(selectedEmployeeName);
                }}
                placeholder="Type to search employee..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-9 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoComplete="off"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {employeeDropdownOpen && (
              <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-300 rounded-lg shadow-lg py-1">
                {filteredEmployees.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500">No employees found</li>
                ) : (
                  filteredEmployees.map(emp => (
                    <li
                      key={emp.id}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50"
                      onClick={() => {
                        setForm(f => ({ ...f, employee_id: String(emp.id), task_id: '' }));
                        setEmployeeSearch('');
                        setEmployeeDropdownOpen(false);
                      }}
                    >
                      {emp.name}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <div ref={taskDropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Task *</label>
            <div
              className={`w-full min-h-[42px] border rounded-lg px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                !form.employee_id
                  ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                  : taskDropdownOpen
                    ? 'border-indigo-500 ring-2 ring-indigo-200 bg-white'
                    : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
              onClick={() => form.employee_id && !tasksLoading && setTaskDropdownOpen(open => !open)}
            >
              <span className="text-sm text-gray-900 truncate pr-2">
                {tasksLoading ? 'Loading tasks...' : selectedTaskTitle || 'Select task...'}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${taskDropdownOpen ? 'rotate-180' : ''}`} />
            </div>
            {taskDropdownOpen && form.employee_id && !tasksLoading && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100 bg-gray-50">
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search tasks..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    autoFocus
                  />
                </div>
                <ul className="max-h-56 overflow-auto py-1">
                  {filteredTasksForDropdown.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-gray-500 text-center">No tasks found</li>
                  ) : (
                    filteredTasksForDropdown.map(task => (
                      <li
                        key={task.id}
                        className={`px-4 py-3 text-sm cursor-pointer transition-colors ${
                          String(task.id) === String(form.task_id)
                            ? 'bg-indigo-50 text-indigo-800 font-medium'
                            : 'text-gray-700 hover:bg-indigo-50/70'
                        }`}
                        onClick={() => {
                          setForm(f => ({ ...f, task_id: String(task.id) }));
                          setTaskSearch('');
                          setTaskDropdownOpen(false);
                        }}
                      >
                        <div className="font-medium truncate">{task.title || 'Untitled'}</div>
                        {(task.status || task.due_date) && (
                          <div className="text-xs text-gray-500 mt-0.5 flex gap-2">
                            {task.status && <span>{task.status}</span>}
                            {task.due_date && <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>}
                          </div>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
            {!form.employee_id && (
              <p className="text-xs text-gray-500 mt-1">Please select an employee first</p>
            )}
            <input type="hidden" name="task_id" value={form.task_id} required />
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setViewingError(err)}
                          className="text-indigo-600 hover:text-indigo-900 p-1 rounded hover:bg-indigo-50"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(err.id)}
                          disabled={deleting}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed p-1 rounded hover:bg-red-50"
                          title="Delete error"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Error Details Modal */}
      <Modal
        isOpen={!!viewingError}
        onClose={() => setViewingError(null)}
        title="Error Record Details"
        size="md"
      >
        {viewingError && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Employee</label>
                <p className="text-sm font-medium text-gray-900">{viewingError.employee_name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Task</label>
                <p className="text-sm font-medium text-gray-900">{viewingError.task_title || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Severity</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  viewingError.severity === 'High' ? 'bg-red-100 text-red-800' :
                  viewingError.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {viewingError.severity}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Error Date</label>
                <p className="text-sm text-gray-900">{viewingError.error_date ? new Date(viewingError.error_date).toLocaleDateString() : '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Created</label>
                <p className="text-sm text-gray-900">{new Date(viewingError.created_at).toLocaleString()}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Description</label>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{viewingError.description || '—'}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setViewingError(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


