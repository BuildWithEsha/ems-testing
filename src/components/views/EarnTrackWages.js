import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DollarSign, Filter, Search, RefreshCw, Settings, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

const STORAGE_KEY = 'ems_earnTrackWages_overrides';

function getAuthHeaders(user) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) {
    headers['user-role'] = user.role || user.user_role || 'employee';
    headers['user-permissions'] = JSON.stringify(
      (user.role === 'admin' || user.role === 'Admin' || user.user_role === 'admin' || user.user_role === 'Admin')
        ? ['all']
        : (user.permissions || [])
    );
    headers['x-user-role'] = user.role || user.user_role || 'employee';
    headers['x-user-permissions'] = headers['user-permissions'];
    if (user.name) headers['user-name'] = user.name;
  }
  return headers;
}

export default function EarnTrackWages() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    department: '',
    designation: '',
    search: ''
  });
  const [timeSummary, setTimeSummary] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingTime, setLoadingTime] = useState(false);
  const [timeError, setTimeError] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [modalEmployee, setModalEmployee] = useState(null);
  const [modalForm, setModalForm] = useState({ hoursPerDay: '', pkrPerHour: '' });

  const headers = useMemo(() => getAuthHeaders(user), [user]);

  useEffect(() => {
    let mounted = true;
    setLoadingEmployees(true);
    fetch('/api/employees?all=true', { headers })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load employees'))))
      .then((data) => {
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        if (mounted) setEmployees(list);
      })
      .catch(() => {
        if (mounted) setEmployees([]);
      })
      .finally(() => {
        if (mounted) setLoadingEmployees(false);
      });
    return () => { mounted = false; };
  }, [headers]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setOverrides(parsed);
      }
    } catch (e) {
      console.warn('EarnTrackWages: could not load overrides from localStorage', e);
    }
  }, []);

  const persistOverrides = useCallback((patch) => {
    setOverrides((prev) => {
      const merged = { ...prev };
      Object.keys(patch).forEach((id) => {
        merged[id] = { ...(merged[id] || {}), ...patch[id] };
      });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch (e) {
        console.warn('EarnTrackWages: could not save overrides', e);
      }
      return merged;
    });
  }, []);

  const fetchTimeSummary = useCallback(async () => {
    const { startDate, endDate } = filters;
    if (!startDate || !endDate) {
      setTimeError('Please set start and end date.');
      return;
    }
    setLoadingTime(true);
    setTimeError(null);
    try {
      const res = await fetch(
        `/api/wages/employee-time-summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { headers }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
      }
      const list = await res.json();
      setTimeSummary(Array.isArray(list) ? list : []);

      const hasTotal = list.some((r) => r.totalHours != null);
      if (!hasTotal) {
        const recRes = await fetch(
          `/api/attendance/records?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
          { headers }
        );
        if (recRes.ok) {
          const records = await recRes.json();
          setAttendanceRecords(Array.isArray(records) ? records : []);
        } else {
          setAttendanceRecords([]);
        }
      } else {
        setAttendanceRecords([]);
      }
    } catch (err) {
      setTimeError(err.message || 'Failed to fetch time summary');
      setTimeSummary([]);
      setAttendanceRecords([]);
    } finally {
      setLoadingTime(false);
    }
  }, [filters.startDate, filters.endDate, headers]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (filters.department) {
      list = list.filter((e) => (e.department || '').toLowerCase().includes(filters.department.toLowerCase()));
    }
    if (filters.designation) {
      list = list.filter((e) => (e.designation || '').toLowerCase().includes(filters.designation.toLowerCase()));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.name || '').toLowerCase().includes(q) ||
          (e.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [employees, filters.department, filters.designation, filters.search]);

  const timeByKey = useMemo(() => {
    const byName = {};
    const byEmail = {};
    timeSummary.forEach((row) => {
      const name = (row.employeeName || '').trim().toLowerCase();
      const email = (row.email || '').trim().toLowerCase();
      if (name) byName[name] = row;
      if (email) byEmail[email] = row;
    });
    return { byName, byEmail };
  }, [timeSummary]);

  const attendanceByEmployeeId = useMemo(() => {
    const map = {};
    attendanceRecords.forEach((rec) => {
      const id = rec.employee_id;
      if (id == null) return;
      if (!map[id]) map[id] = 0;
      map[id] += Number(rec.duration_seconds) || 0;
    });
    return map;
  }, [attendanceRecords]);

  const rows = useMemo(() => {
    return filteredEmployees.map((emp) => {
      const name = (emp.name || '').trim();
      const nameLower = name.toLowerCase();
      const emailLower = (emp.email || '').trim().toLowerCase();
      const timeRow = timeByKey.byName[nameLower] || timeByKey.byEmail[emailLower];
      let totalHours = timeRow?.totalHours ?? null;
      const idleHours = timeRow?.idleHours ?? 0;
      if (totalHours == null && attendanceByEmployeeId[emp.id] != null) {
        totalHours = Number((attendanceByEmployeeId[emp.id] / 3600).toFixed(2));
      }
      const activeHours = totalHours != null ? Math.max(0, (totalHours - idleHours)) : null;
      const override = overrides[emp.id] || {};
      const pkrPerHour = override.pkrPerHour != null && override.pkrPerHour !== '' ? Number(override.pkrPerHour) : null;
      const salary = activeHours != null && pkrPerHour != null && pkrPerHour > 0
        ? Number((activeHours * pkrPerHour).toFixed(2))
        : null;
      return {
        employee: emp,
        totalHours,
        idleHours,
        activeHours,
        hoursPerDay: override.hoursPerDay,
        pkrPerHour,
        salary
      };
    });
  }, [filteredEmployees, timeByKey, attendanceByEmployeeId, overrides]);

  const openModal = (emp, row) => {
    const override = overrides[emp.id] || {};
    setModalEmployee(emp);
    setModalForm({
      hoursPerDay: override.hoursPerDay ?? '',
      pkrPerHour: override.pkrPerHour ?? ''
    });
  };

  const closeModal = () => {
    setModalEmployee(null);
  };

  const saveModal = () => {
    if (!modalEmployee) return;
    persistOverrides({
      [modalEmployee.id]: {
        hoursPerDay: modalForm.hoursPerDay === '' ? undefined : String(modalForm.hoursPerDay).trim(),
        pkrPerHour: modalForm.pkrPerHour === '' ? undefined : String(modalForm.pkrPerHour).trim()
      }
    });
    closeModal();
  };

  const formatHours = (h) => {
    if (h == null) return '–';
    return `${Number(h).toFixed(2)} h`;
  };

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-8 h-8 text-indigo-600" />
          Wages Tracker
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">End date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Department</label>
            <input
              type="text"
              placeholder="Filter by department"
              value={filters.department}
              onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md w-40"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Designation</label>
            <input
              type="text"
              placeholder="Filter by designation"
              value={filters.designation}
              onChange={(e) => setFilters((f) => ({ ...f, designation: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md w-40"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Search (name / email)</label>
            <input
              type="text"
              placeholder="Search"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md w-48"
            />
          </div>
          <Button onClick={fetchTimeSummary} disabled={loadingTime} className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loadingTime ? 'animate-spin' : ''}`} />
            {loadingTime ? 'Fetching…' : 'Fetch time'}
          </Button>
        </div>
        {timeError && (
          <p className="mt-3 text-sm text-red-600">{timeError}</p>
        )}
      </div>

      {loadingEmployees ? (
        <p className="text-gray-500">Loading employees…</p>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hours/day</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total worked</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Idle</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Active (excl. idle)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">PKR/hour</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Salary (PKR)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map(({ employee, totalHours, idleHours, activeHours, hoursPerDay, pkrPerHour, salary }) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{employee.name || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{employee.department || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{employee.designation || '–'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{hoursPerDay ?? '–'}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{formatHours(totalHours)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{formatHours(idleHours)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-indigo-600">{formatHours(activeHours)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{pkrPerHour != null ? pkrPerHour : '–'}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-medium text-green-700">
                    {salary != null ? salary.toLocaleString('en-PK') : '–'}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => openModal(employee, { hoursPerDay, pkrPerHour })}>
                      <Settings className="w-4 h-4 mr-1 inline" /> Set
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500">No employees match the filters.</div>
          )}
        </div>
      )}

      <Modal
        isOpen={!!modalEmployee}
        onClose={closeModal}
        title={modalEmployee ? `Wage settings – ${modalEmployee.name}` : 'Wage settings'}
        size="sm"
      >
        {modalEmployee && (
          <div className="space-y-4">
            <Input
              label="Hours per day (optional)"
              name="hoursPerDay"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 8"
              value={modalForm.hoursPerDay}
              onChange={(e) => setModalForm((f) => ({ ...f, hoursPerDay: e.target.value }))}
            />
            <Input
              label="PKR per hour"
              name="pkrPerHour"
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 500"
              value={modalForm.pkrPerHour}
              onChange={(e) => setModalForm((f) => ({ ...f, pkrPerHour: e.target.value }))}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button onClick={saveModal}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
