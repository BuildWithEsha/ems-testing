import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function Issues() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ department_id: '', task_id: '', severity: 'High', description: '', issue_date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIssues, setSelectedIssues] = useState([]);
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
      
      const [deptRes, taskRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/tasks?all=true', { headers: tasksHeaders })
      ]);
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        // Handle both paginated and non-paginated responses
        setDepartments(Array.isArray(deptData.data) ? deptData.data : (Array.isArray(deptData) ? deptData : []));
      }
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        console.log('Raw task data from API:', taskData);
        // Handle both paginated and non-paginated responses
        const tasksArray = Array.isArray(taskData.data) ? taskData.data : (Array.isArray(taskData) ? taskData : []);
        console.log('Processed tasks array:', tasksArray);
        console.log('Number of tasks loaded:', tasksArray.length);
        setTasks(tasksArray);
      } else {
        console.error('Failed to fetch tasks:', taskRes.status, taskRes.statusText);
      }
    };
    
    if (user) {
      fetchInitial();
    }
    fetch('/api/issues').then(r=>r.ok?r.json():[]).then(setIssues).catch(()=>{});
  }, [user]);

  const filteredTasks = useMemo(() => {
    if (!form.department_id) return [];
    const department = (departments || []).find(d => String(d.id) === String(form.department_id));
    if (!department) return [];
    const departmentName = department.name;
    
    console.log('=== TASK FILTERING DEBUG ===');
    console.log('Selected Department:', departmentName);
    console.log('Department ID:', form.department_id);
    console.log('All tasks available:', tasks);
    console.log('Number of tasks:', tasks?.length || 0);
    
    // Filter tasks by department
    const filtered = (tasks || []).filter(task => {
      console.log('Checking task:', task.title, 'assigned_to:', task.assigned_to, 'department:', task.department);
      
      // Check if task has assigned_to field and it contains department name
      if (task.assigned_to && task.assigned_to.includes(departmentName)) {
        console.log('✓ Task matches by assigned_to field');
        return true;
      }
      
      // Alternative: Check if task has department_id field
      if (task.department_id && String(task.department_id) === String(form.department_id)) {
        console.log('✓ Task matches by department_id field');
        return true;
      }
      
      // Alternative: Check if task has department field
      if (task.department && task.department === departmentName) {
        console.log('✓ Task matches by department field');
        return true;
      }
      
      // Check if assigned_to contains any employee from this department
      if (task.assigned_to) {
        // This is a more complex check - we'd need to get employees from this department
        // For now, let's be more permissive and show tasks that might be related
        const assignedToLower = task.assigned_to.toLowerCase();
        const departmentNameLower = departmentName.toLowerCase();
        
        // Check if department name appears in assigned_to (case insensitive)
        if (assignedToLower.includes(departmentNameLower)) {
          console.log('✓ Task matches by department name in assigned_to');
          return true;
        }
      }
      
      console.log('✗ Task does not match department');
      return false;
    });
    
    console.log('Filtered tasks count:', filtered.length);
    console.log('Filtered tasks:', filtered);
    
    // If no department-specific tasks found, show all tasks as fallback
    if (filtered.length === 0) {
      console.log('No department-specific tasks found, showing all tasks as fallback');
      return tasks || [];
    }
    
    return filtered;
  }, [form.department_id, departments, tasks]);

  const displayedIssues = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(i => (i.department_name || '').toLowerCase().includes(q));
  }, [issues, searchTerm]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.department_id || !form.task_id || !form.description.trim()) return alert('All fields are required.');
    setSubmitting(true);
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setForm({ department_id: '', task_id: '', severity: 'High', description: '', issue_date: '' });
      setIssues(prev => [data.item, ...prev]);
      alert('Saved');
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle individual delete
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this issue record?')) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`/api/issues/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setIssues(prev => prev.filter(issue => issue.id !== id));
        setSelectedIssues(prev => prev.filter(selectedId => selectedId !== id));
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting record');
      }
    } catch (error) {
      console.error('Error deleting issue:', error);
      alert('Error deleting record');
    } finally {
      setDeleting(false);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedIssues.length === 0) {
      alert('Please select issues to delete');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedIssues.length} issue record(s)?`)) return;
    
    setDeleting(true);
    try {
      const response = await fetch('/api/issues/bulk', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedIssues }),
      });
      
      if (response.ok) {
        const result = await response.json();
        setIssues(prev => prev.filter(issue => !selectedIssues.includes(issue.id)));
        setSelectedIssues([]);
        alert(result.message);
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting records');
      }
    } catch (error) {
      console.error('Error bulk deleting issues:', error);
      alert('Error deleting records');
    } finally {
      setDeleting(false);
    }
  };

  // Handle individual checkbox change
  const handleSelectIssue = (issueId) => {
    setSelectedIssues(prev => {
      const newSelected = prev.includes(issueId)
        ? prev.filter(id => id !== issueId)
        : [...prev, issueId];
      return newSelected;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = () => {
    const allDisplayedIds = displayedIssues.map(issue => issue.id);
    const allSelected = allDisplayedIds.every(id => selectedIssues.includes(id));
    
    if (allSelected) {
      setSelectedIssues(prev => prev.filter(id => !allDisplayedIds.includes(id)));
    } else {
      setSelectedIssues(prev => [...new Set([...prev, ...allDisplayedIds])]);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Department Issues</h1>
      </div>

      <form onSubmit={submit} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Department *</label>
            <select 
              value={form.department_id} 
              onChange={e=>setForm(f=>({...f, department_id: e.target.value, task_id: ''}))} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="">Select Department...</option>
              {(departments || []).map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Task *</label>
            <select 
              value={form.task_id} 
              onChange={e=>setForm(f=>({...f, task_id: e.target.value}))} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100" 
              disabled={!form.department_id}
              required
            >
              <option value="">Select Task...</option>
              {filteredTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            {!form.department_id && (
              <p className="text-xs text-gray-500 mt-1">Please select a department first</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Issue Date</label>
            <input 
              type="date" 
              value={form.issue_date} 
              onChange={e=>setForm(f=>({...f, issue_date: e.target.value}))} 
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
            placeholder="Describe the issue in detail..."
            required
          />
        </div>
        <div className="flex justify-end pt-4">
          <button 
            type="submit" 
            disabled={submitting} 
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {submitting ? 'Saving...' : 'Save Issue'}
          </button>
        </div>
      </form>

      <div className="mt-8 bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-gray-900">Issue Records</h2>
            {selectedIssues.length > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : `Delete Selected (${selectedIssues.length})`}
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Search by department..."
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
                    checked={displayedIssues.length > 0 && displayedIssues.every(issue => selectedIssues.includes(issue.id))}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issue Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedIssues.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    No issue records found
                  </td>
                </tr>
              ) : (
                displayedIssues.map(issue => (
                  <tr key={issue.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIssues.includes(issue.id)}
                        onChange={() => handleSelectIssue(issue.id)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{issue.department_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{issue.task_title}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        issue.severity === 'High' ? 'bg-red-100 text-red-800' :
                        issue.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={issue.description}>{issue.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{issue.issue_date ? new Date(issue.issue_date).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(issue.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDelete(issue.id)}
                        disabled={deleting}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete issue"
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
