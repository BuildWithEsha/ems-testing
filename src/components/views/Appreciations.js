import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function Appreciations() {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ employee_id: '', title: '', appreciation_date: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAppreciations, setSelectedAppreciations] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const [appreciationOptions, setAppreciationOptions] = useState([]);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  useEffect(() => {
    const fetchInitial = async () => {
      const [empRes, apprRes, typesRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/appreciations'),
        fetch('/api/appreciation-types')
      ]);
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(Array.isArray(empData.data) ? empData.data : (Array.isArray(empData) ? empData : []));
      }
      if (apprRes.ok) setItems(await apprRes.json());
      if (typesRes.ok) setAppreciationOptions((await typesRes.json()).map(t => t.name));
    };
    fetchInitial();
  }, []);

  const displayedItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter(e => (e.employee_name || '').toLowerCase().includes(q));
  }, [items, searchTerm]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.title || !form.description.trim()) return alert('All fields are required.');
    setSubmitting(true);
    try {
      const res = await fetch('/api/appreciations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: text }; }
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setForm({ employee_id: '', title: '', appreciation_date: '', description: '' });
      setItems(prev => [data.item, ...prev]);
      alert('Saved');
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle individual delete
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this appreciation record?')) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`/api/appreciations/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setItems(prev => prev.filter(item => item.id !== id));
        setSelectedAppreciations(prev => prev.filter(selectedId => selectedId !== id));
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting record');
      }
    } catch (error) {
      console.error('Error deleting appreciation:', error);
      alert('Error deleting record');
    } finally {
      setDeleting(false);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedAppreciations.length === 0) {
      alert('Please select appreciations to delete');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedAppreciations.length} appreciation record(s)?`)) return;
    
    setDeleting(true);
    try {
      const response = await fetch('/api/appreciations/bulk', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedAppreciations }),
      });
      
      if (response.ok) {
        const result = await response.json();
        setItems(prev => prev.filter(item => !selectedAppreciations.includes(item.id)));
        setSelectedAppreciations([]);
        alert(result.message);
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting records');
      }
    } catch (error) {
      console.error('Error bulk deleting appreciations:', error);
      alert('Error deleting records');
    } finally {
      setDeleting(false);
    }
  };

  // Handle individual checkbox change
  const handleSelectAppreciation = (appreciationId) => {
    setSelectedAppreciations(prev => {
      const newSelected = prev.includes(appreciationId)
        ? prev.filter(id => id !== appreciationId)
        : [...prev, appreciationId];
      return newSelected;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = () => {
    const allDisplayedIds = displayedItems.map(item => item.id);
    const allSelected = allDisplayedIds.every(id => selectedAppreciations.includes(id));
    
    if (allSelected) {
      setSelectedAppreciations(prev => prev.filter(id => !allDisplayedIds.includes(id)));
    } else {
      setSelectedAppreciations(prev => [...new Set([...prev, ...allDisplayedIds])]);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Appreciations</h1>

      <form onSubmit={submit} className="space-y-4 bg-white p-4 rounded border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select value={form.employee_id} onChange={e=>setForm(f=>({ ...f, employee_id: e.target.value }))} className="w-full border rounded px-3 py-2">
              <option value="">Select...</option>
              {(employees || []).map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Appreciation</label>
            <div className="flex gap-2">
              <select value={form.title} onChange={e=>setForm(f=>({ ...f, title: e.target.value }))} className="w-full border rounded px-3 py-2">
                <option value="">Select...</option>
                {appreciationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              <button type="button" className="px-3 py-2 border rounded text-sm" onClick={()=> setShowAddType(true)}>Add</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={form.appreciation_date} onChange={e=>setForm(f=>({ ...f, appreciation_date: e.target.value }))} className="w-full border rounded px-3 py-2" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={form.description} onChange={e=>setForm(f=>({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2" rows={4} />
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Save'}</button>
        </div>
      </form>

      {showAddType && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-3">Add Appreciation</div>
            <div className="space-y-3">
              <input
                type="text"
                value={newTypeName}
                onChange={(e)=>setNewTypeName(e.target.value)}
                placeholder="e.g. Outstanding Performance"
                className="w-full border rounded px-3 py-2"
              />
              <div className="flex justify-end gap-2">
                <button type="button" className="px-3 py-2 border rounded" onClick={()=>{ setShowAddType(false); setNewTypeName(''); }}>Cancel</button>
                <button
                  type="button"
                  className="px-3 py-2 bg-indigo-600 text-white rounded"
                  onClick={async ()=>{
                    const name = newTypeName.trim();
                    if (!name) return;
                    try {
                      const res = await fetch('/api/appreciation-types', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                      });
                      const text = await res.text();
                      let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
                      if (!res.ok) throw new Error(data.error || 'Failed');
                      const savedName = data.name || name;
                      setAppreciationOptions(prev => Array.from(new Set([...prev, savedName])));
                      setForm(f => ({ ...f, title: savedName }));
                      setShowAddType(false);
                      setNewTypeName('');
                    } catch (err) {
                      alert(err.message);
                    }
                  }}
                >Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-gray-900">Appreciation Records</h2>
            {selectedAppreciations.length > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleting ? 'Deleting...' : `Delete Selected (${selectedAppreciations.length})`}
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
                    checked={displayedItems.length > 0 && displayedItems.every(item => selectedAppreciations.includes(item.id))}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Appreciation</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No appreciation records found
                  </td>
                </tr>
              ) : (
                displayedItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedAppreciations.includes(item.id)}
                        onChange={() => handleSelectAppreciation(item.id)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.employee_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={item.description}>{item.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.appreciation_date ? new Date(item.appreciation_date).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(item.created_at).toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete appreciation"
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


