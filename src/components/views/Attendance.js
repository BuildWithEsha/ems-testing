import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Trash2, Upload, Download } from 'lucide-react';
import { fetchArray } from '../../utils/apiHelpers';

export default function Attendance() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState({ active: false, entry: null });
  const [summary, setSummary] = useState({ total_seconds: 0, entries: [] });
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [dayDate, setDayDate] = useState(() => new Date().toISOString().slice(0,10));
  const [daySummary, setDaySummary] = useState({ date: '', entries: [], notClockedIn: [] });
  const [showNotClockedIn, setShowNotClockedIn] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [summaryData, setSummaryData] = useState({
    total_days: 0,
    total_hours: 0,
    total_seconds: 0,
    absentees: 0
  });
  const [showImportedRecords, setShowImportedRecords] = useState(true);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState('management'); // 'management' or 'log'

  useEffect(() => {
    fetchArray('/api/employees')
      .then(employeesData => {
        console.log('Attendance - Employees data:', employeesData);
        setEmployees(employeesData);
      })
      .catch(error => {
        console.error('Error fetching employees:', error);
        setEmployees([]);
      });
  }, []);

  const refresh = async () => {
    if (!employeeId) return;
    const [sRes, mRes] = await Promise.all([
      fetch(`/api/attendance/status?employee_id=${employeeId}`),
      fetch(`/api/attendance/summary?employee_id=${employeeId}&month=${month}&year=${year}`)
    ]);
    if (sRes.ok) setStatus(await sRes.json());
    if (mRes.ok) setSummary(await mRes.json());
  };

  useEffect(() => { refresh(); }, [employeeId, month, year]);

  const loadDaySummary = async () => {
    const res = await fetch(`/api/attendance/daily-log?date=${dayDate}`);
    if (res.ok) setDaySummary(await res.json());
  };
  useEffect(() => { loadDaySummary(); }, [dayDate]);

  const clockIn = async () => {
    if (!employeeId) return alert('Select employee');
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/clock-in', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId })
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      await refresh();
    } catch (e) { alert(e.message || 'Error'); } finally { setLoading(false); }
  };

  const clockOut = async () => {
    if (!employeeId) return alert('Select employee');
    setLoading(true);
    try {
      const res = await fetch('/api/attendance/clock-out', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId })
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      await refresh();
    } catch (e) { alert(e.message || 'Error'); } finally { setLoading(false); }
  };

  const formatHMS = (s) => {
    // Ensure s is a number
    const seconds = typeof s === 'number' ? s : 0;
    const h = Math.floor(seconds / 3600); 
    const m = Math.floor((seconds % 3600) / 60); 
    const sec = seconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  // Format date to readable format
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    
    // Handle Excel serial numbers (numbers like 45869)
    if (typeof dateString === 'number' || !isNaN(dateString)) {
      const excelDate = new Date((parseInt(dateString) - 25569) * 86400 * 1000);
      return excelDate.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    }
    
    // Handle regular date strings
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  // Form state for adding/editing attendance
  const [formData, setFormData] = useState({
    employee_id: '',
    date: new Date().toISOString().slice(0, 10),
    clock_in: '09:00',
    clock_out: '',
    hours_worked: ''
  });

  // Load attendance records (excluding imported records)
  const loadAttendanceRecords = async () => {
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams();
      if (employeeId) params.append('employee_id', employeeId);
      if (fromDate) params.append('from_date', fromDate);
      if (toDate) params.append('to_date', toDate);
      // Removed limit to show all records
      if (!showImportedRecords) {
        params.append('exclude_imported', 'true'); // Add parameter to exclude imported records
      }
      
      // Fetch attendance records
      const recordsResponse = await fetch(`/api/attendance/records?${params}`);
      if (recordsResponse.ok) {
        const recordsData = await recordsResponse.json();
        setAttendanceRecords(recordsData);
      }

      // Fetch summary data
      const summaryParams = new URLSearchParams();
      if (employeeId) summaryParams.append('employee_id', employeeId);
      if (fromDate) summaryParams.append('from_date', fromDate);
      if (toDate) summaryParams.append('to_date', toDate);
      if (!showImportedRecords) {
        summaryParams.append('exclude_imported', 'true');
      }
      
      const summaryResponse = await fetch(`/api/attendance/summary?${summaryParams}`);
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        // Ensure numeric values are properly typed
        setSummaryData({
          total_days: parseInt(summaryData.total_days) || 0,
          total_hours: parseFloat(summaryData.total_hours) || 0,
          total_seconds: parseInt(summaryData.total_seconds) || 0,
          absentees: parseInt(summaryData.absentees) || 0
        });
      }
    } catch (error) {
      console.error('Error loading attendance data:', error);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadAttendanceRecords();
  }, [employeeId, fromDate, toDate, showImportedRecords]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingRecord 
        ? `/api/attendance/${editingRecord.id}`
        : '/api/attendance/add';
      
      const method = editingRecord ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        setShowAddForm(false);
        setEditingRecord(null);
        setFormData({
          employee_id: '',
          date: new Date().toISOString().slice(0, 10),
          clock_in: '09:00',
          clock_out: '',
          hours_worked: ''
        });
        await loadAttendanceRecords();
        await refresh();
      } else {
        const error = await response.json();
        alert(error.error || 'Error saving attendance record');
      }
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('Error saving attendance record');
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    
    // Ensure date is properly formatted for the date input field
    let formattedDate = record.date;
    if (record.date) {
      // Handle Excel serial numbers or different date formats
      if (typeof record.date === 'number' || !isNaN(record.date)) {
        const excelDate = new Date((parseInt(record.date) - 25569) * 86400 * 1000);
        formattedDate = excelDate.toISOString().split('T')[0];
      } else if (typeof record.date === 'string') {
        // Try to parse the date string
        const parsedDate = new Date(record.date);
        if (!isNaN(parsedDate.getTime())) {
          formattedDate = parsedDate.toISOString().split('T')[0];
        }
      }
    }
    
    setFormData({
      employee_id: record.employee_id,
      date: formattedDate,
      clock_in: record.clock_in,
      clock_out: record.clock_out || '',
      hours_worked: record.hours_worked || ''
    });
    setShowAddForm(true);
  };

  // Handle delete
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    
    try {
      const response = await fetch(`/api/attendance/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        alert('Attendance record deleted successfully');
        await loadAttendanceRecords();
        await refresh();
      } else {
        const error = await response.json();
        alert(error.error || 'Error deleting attendance record');
      }
    } catch (error) {
      console.error('Error deleting attendance:', error);
      alert('Error deleting attendance record');
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedRecords.length === 0) {
      alert('Please select records to delete');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${selectedRecords.length} attendance record(s)?`)) return;
    
    console.log('Sending bulk delete request with IDs:', selectedRecords);
    
    try {
      const response = await fetch('/api/attendance/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedRecords })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Bulk delete success:', result);
        alert(result.message);
        setSelectedRecords([]);
        setSelectAll(false);
        await loadAttendanceRecords();
        await refresh();
      } else {
        const error = await response.json();
        console.error('Bulk delete error response:', error);
        alert(error.error || 'Error deleting attendance records');
      }
    } catch (error) {
      console.error('Error deleting attendance records:', error);
      alert('Error deleting attendance records');
    }
  };

  // Handle clear all data
  const handleClearAllData = async () => {
    if (!confirm('⚠️ WARNING: This will permanently delete ALL attendance records from the database. This action cannot be undone. Are you absolutely sure?')) {
      return;
    }
    
    if (!confirm('Final confirmation: You are about to delete ALL attendance records. This will affect all employees and cannot be recovered. Continue?')) {
      return;
    }
    
    try {
      const response = await fetch('/api/attendance/clear-all', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'x-confirm-clear-all': 'true'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        setSelectedRecords([]);
        setSelectAll(false);
        await loadAttendanceRecords();
        await refresh();
      } else {
        const error = await response.json();
        alert(error.error || 'Error clearing all attendance data');
      }
    } catch (error) {
      console.error('Error clearing all attendance data:', error);
      alert('Error clearing all attendance data');
    }
  };

  // Handle record selection
  const handleSelectRecord = (recordId) => {
    setSelectedRecords(prev => {
      if (prev.includes(recordId)) {
        return prev.filter(id => id !== recordId);
      } else {
        return [...prev, recordId];
      }
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRecords([]);
      setSelectAll(false);
    } else {
      setSelectedRecords(attendanceRecords.map(record => record.id));
      setSelectAll(true);
    }
  };

  // Handle file import
  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/attendance/import', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        await loadAttendanceRecords();
        await refresh();
      } else {
        const error = await response.json();
        alert(error.error || 'Error importing attendance records');
      }
    } catch (error) {
      console.error('Error importing attendance:', error);
      alert('Error importing attendance records');
    } finally {
      setImporting(false);
      setShowImportModal(false);
      // Reset file input
      event.target.value = '';
    }
  };

  // Download sample file
  const handleDownloadSample = async () => {
    try {
      const response = await fetch('/api/attendance/sample');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'attendance_import_sample.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Error downloading sample file');
      }
    } catch (error) {
      console.error('Error downloading sample:', error);
      alert('Error downloading sample file');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Attendance</h1>
      
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('management')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'management'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Attendance Management
          </button>
          <button
            onClick={() => setActiveTab('log')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'log'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Attendance Log
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'management' && (
        <div className="bg-white p-6 rounded-lg shadow-sm border space-y-6">
          {/* Header Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
              <select value={employeeId} onChange={(e)=>setEmployeeId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">Select Employee...</option>
                {Array.isArray(employees) ? employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>) : []}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={(e)=>setToDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button 
                onClick={loadAttendanceRecords}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Search
              </button>
              <button 
                onClick={() => {
                  setFormData(prev => ({ ...prev, employee_id: employeeId || '' }));
                  setShowAddForm(true);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add Record
              </button>
              <button 
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                <Upload className="w-4 h-4 inline mr-1" />
                Import
              </button>
              <button 
                onClick={handleDownloadSample}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium"
              >
                <Download className="w-4 h-4 inline mr-1" />
                Sample
              </button>
            </div>
            
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleClearAllData}
                className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 text-sm font-medium"
                title="Clear all attendance data from database"
              >
                <Trash2 className="w-4 h-4 inline mr-1" />
                Clear All Data
              </button>
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 p-4 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-900">{summaryData.total_days}</div>
              <div className="text-sm text-gray-600">Total Days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-900">
                {typeof summaryData.total_hours === 'number' ? `${summaryData.total_hours.toFixed(2)}h` : '0.00h'}
              </div>
              <div className="text-sm text-gray-600">Total Hours</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-900">
                {summaryData.absentees > 0 ? summaryData.absentees : 'N/A'}
              </div>
              <div className="text-sm text-gray-600">Absentees</div>
            </div>
          </div>
          
          {/* Info Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  <strong>Note:</strong> All attendance records are now displayed without any limit. You can view, edit, or delete any record in the system.
                </p>
              </div>
            </div>
          </div>

                {/* Attendance Records Table */}
        <div className="mt-6 bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-gray-900">Attendance Records</h2>
              <span className="text-sm text-gray-500">
                {loadingRecords ? 'Loading...' : `${attendanceRecords.length} record(s) loaded`}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {selectedRecords.length > 0 && (
                <button 
                  onClick={handleBulkDelete}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4 inline mr-1" />
                  Delete Selected ({selectedRecords.length})
                </button>
              )}
              <button 
                onClick={() => {
                  setFormData(prev => ({ ...prev, employee_id: employeeId || '' }));
                  setShowAddForm(true);
                }}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add Record
              </button>
            </div>
          </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectAll && attendanceRecords.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock In</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock Out</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loadingRecords ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    Loading attendance records...
                  </td>
                </tr>
              ) : attendanceRecords.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                    No attendance records found for the selected date range
                  </td>
                </tr>
              ) : (
                attendanceRecords.map(record => (
                  <tr key={record.id} className={`hover:bg-gray-50 ${record.is_imported ? 'bg-blue-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <input
                        type="checkbox"
                        checked={selectedRecords.includes(record.id)}
                        onChange={() => handleSelectRecord(record.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {record.employee_name}
                      {record.is_imported && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Imported
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(record.date)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.clock_in}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.clock_out || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button 
                        onClick={() => {
                          if (record.session_count > 1 && record.sessions) {
                            const sessionDetails = record.sessions.map((s, i) => 
                              `Session ${i+1}: ${s.clock_in} - ${s.clock_out || 'Active'} (${formatHMS(s.duration_seconds || 0)})`
                            ).join('\n');
                            alert(`${record.employee_name}'s Sessions for ${formatDate(record.date)}:\n\n${sessionDetails}\n\nTotal: ${formatHMS(record.duration_seconds || 0)}`);
                          }
                        }}
                        className={`text-left ${record.session_count > 1 ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                        title={record.session_count > 1 ? "Click to view detailed sessions" : "Single session"}
                      >
                        {record.duration_seconds && record.duration_seconds > 0 ? formatHMS(record.duration_seconds) : 
                         record.hours_worked && typeof record.hours_worked === 'number' && record.hours_worked > 0 ? `${record.hours_worked.toFixed(2)}h` : '-'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Edit record"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(record.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete record"
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
        </div>
      )}

      {/* Add/Edit Attendance Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingRecord ? 'Edit Attendance Record' : 'Add Attendance Record'}
              </h3>
            </div>
            
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select 
                  value={formData.employee_id} 
                  onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select Employee...</option>
                  {Array.isArray(employees) ? employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  )) : []}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  value={formData.date} 
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clock In</label>
                  <input 
                    type="time" 
                    value={formData.clock_in} 
                    onChange={(e) => setFormData(prev => ({ ...prev, clock_in: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clock Out</label>
                  <input 
                    type="time" 
                    value={formData.clock_out} 
                    onChange={(e) => setFormData(prev => ({ ...prev, clock_out: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hours Worked (optional)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={formData.hours_worked} 
                  onChange={(e) => setFormData(prev => ({ ...prev, hours_worked: e.target.value }))}
                  placeholder="e.g., 8.5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to calculate from clock in/out times</p>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingRecord(null);
                    setFormData({
                      employee_id: '',
                      date: new Date().toISOString().slice(0, 10),
                      clock_in: '09:00',
                      clock_out: '',
                      hours_worked: ''
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {editingRecord ? 'Update' : 'Add'} Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance Log Tab */}
      {activeTab === 'log' && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Attendance Log</h2>
            <div className="flex items-center space-x-2">
              <input 
                type="date" 
                value={dayDate} 
                onChange={(e)=>setDayDate(e.target.value)} 
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
              />
              <button 
                onClick={()=>setShowNotClockedIn(false)} 
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  !showNotClockedIn 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button 
                onClick={()=>setShowNotClockedIn(true)} 
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  showNotClockedIn 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Not Clocked In
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {showNotClockedIn ? (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                  ) : (
                    <>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Employee
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Clock In
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Clock Out
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duration
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {showNotClockedIn ? (
                  !daySummary.notClockedIn || daySummary.notClockedIn.length === 0 ? (
                    <tr>
                      <td colSpan="1" className="px-6 py-8 text-center text-gray-500">
                        All employees have clocked in today
                      </td>
                    </tr>
                  ) : (
                    (daySummary.notClockedIn || []).map(emp => (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {emp.name}
                        </td>
                      </tr>
                    ))
                  )
                ) : (
                  !daySummary.entries || daySummary.entries.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                        No attendance entries found for this date
                      </td>
                    </tr>
                  ) : (
                    (daySummary.entries || []).map(e => (
                      <tr key={e.employee_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <button 
                            onClick={() => {
                              const employee = daySummary.employee_totals?.find(emp => emp.employee_id === e.employee_id);
                              if (employee && employee.sessions.length > 1) {
                                alert(`${e.employee_name}'s Sessions for ${dayDate}:\n\n${employee.sessions.map((s, i) => 
                                  `Session ${i+1}: ${s.clock_in} - ${s.clock_out || 'Active'} (${formatHMS(s.duration_seconds || 0)})`
                                ).join('\n')}\n\nTotal: ${formatHMS(e.total_seconds || 0)}`);
                              }
                            }}
                            className="text-indigo-600 hover:text-indigo-900 font-medium cursor-pointer"
                            title={daySummary.employee_totals?.find(emp => emp.employee_id === e.employee_id)?.sessions.length > 1 ? 
                              "Click to view detailed sessions" : "Single session"}
                          >
                            {e.employee_name}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {e.first_clock_in || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {e.last_clock_out || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatHMS(e.total_seconds || 0)}
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Import Attendance Records</h3>
            </div>
            
            <div className="px-6 py-4 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Upload an Excel file with attendance records. The file should contain columns for Employee Name, Date, Clock In, Clock Out (optional), and Hours Worked (optional).
                </p>
                
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleImport}
                    disabled={importing}
                    className="hidden"
                    id="attendance-import-file"
                  />
                  <label 
                    htmlFor="attendance-import-file"
                    className="cursor-pointer inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {importing ? 'Importing...' : 'Choose File'}
                  </label>
                  <p className="text-xs text-gray-500 mt-2">Supports .xlsx and .xls files</p>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <button 
                  onClick={handleDownloadSample}
                  className="text-indigo-600 hover:text-indigo-800 text-sm flex items-center"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download Sample File
                </button>
                
                <button 
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


