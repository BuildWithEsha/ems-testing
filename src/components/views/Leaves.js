import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const TABS = {
  APPLY: 'apply',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  POLICY: 'policy',
  REPORT: 'report',
};

// initialManagerSection determines which completely separate UI to show:
// - undefined / null → "My Leaves" (per-employee self-service)
// - 'department'     → Department leaves management for managers/admins
// - 'markUninformed' → Mark uninformed leaves for employees
export default function Leaves({ initialTab, initialManagerSection }) {
  const { user } = useAuth();
  const mode =
    initialManagerSection === 'department'
      ? 'department'
      : initialManagerSection === 'markUninformed'
      ? 'markUninformed'
      : 'my';

  // Tab state for "My Leaves" self-service view
  const [activeTab, setActiveTab] = useState(
    initialTab && Object.values(TABS).includes(initialTab) ? initialTab : TABS.APPLY
  );
  // Tab state for Department view (pending / approved / rejected)
  const [departmentTab, setDepartmentTab] = useState(
    initialTab && [TABS.PENDING, TABS.APPROVED, TABS.REJECTED].includes(initialTab)
      ? initialTab
      : TABS.PENDING
  );
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    start_date: '',
    end_date: '',
    start_segment: 'full_day',
    end_segment: 'full_day',
    reason: '',
  });
  const [myLeaves, setMyLeaves] = useState({ pending: [], recent_approved: [], recent_rejected: [] });
  const [policy, setPolicy] = useState(null);
  const [report, setReport] = useState(null);
  const [departmentLeaves, setDepartmentLeaves] = useState({ pending: [], recent_approved: [], recent_rejected: [] });
  const [departmentSearch, setDepartmentSearch] = useState('');
  const isAdmin = user?.role === 'admin' || user?.role === 'Admin';
  const isManagerOrAdmin = isAdmin || user?.is_manager;

  const employeeId = user?.id;
  const departmentId = user?.department_id || null;

  const [markUninformedForm, setMarkUninformedForm] = useState({
    employee_id: '',
    start_date: '',
    end_date: '',
    start_segment: 'full_day',
    end_segment: 'full_day',
    reason: 'Uninformed leave',
  });
  const [markUninformedEmployees, setMarkUninformedEmployees] = useState([]);
  const [uninformedEmployeeSearch, setUninformedEmployeeSearch] = useState('');
  const [uninformedDepartmentFilter, setUninformedDepartmentFilter] = useState('');
  const [selectedEmployeeReport, setSelectedEmployeeReport] = useState(null);
  const [uninformedEmployeeDropdownOpen, setUninformedEmployeeDropdownOpen] = useState(false);
  const uninformedEmployeeDropdownRef = useRef(null);

  // Shared leave-details modal state for My Leaves & Department views
  const [selectedLeaveForDetails, setSelectedLeaveForDetails] = useState(null);

  // Filters for My Leaves (pending/approved/rejected)
  const [myFilters, setMyFilters] = useState({
    startDate: '',
    endDate: '',
    minDays: '',
    maxDays: '',
    type: 'all', // all | regular | uninformed
  });

  // Filters for Department leaves
  const [deptFilters, setDeptFilters] = useState({
    startDate: '',
    endDate: '',
    minDays: '',
    maxDays: '',
    type: 'all', // all | regular | uninformed
  });

  // Filters for uninformed table in My Leave Report
  const [uninformedReportFilters, setUninformedReportFilters] = useState({
    startDate: '',
    endDate: '',
    minDays: '',
    maxDays: '',
  });

  // Filters for selected employee's uninformed list in Mark Uninformed view
  const [markUninformedFilters, setMarkUninformedFilters] = useState({
    startDate: '',
    endDate: '',
    minDays: '',
    maxDays: '',
  });

  const loadMyLeaves = async () => {
    if (!employeeId) return;
    try {
      const res = await fetch(`/api/leaves/my?employee_id=${employeeId}`);
      if (res.ok) {
        const data = await res.json();
        setMyLeaves({
          pending: data.pending || [],
          recent_approved: data.recent_approved || [],
          recent_rejected: data.recent_rejected || [],
        });
      }
    } catch (err) {
      console.error('Error loading my leaves', err);
    }
  };

  const loadPolicy = async () => {
    try {
      const res = await fetch('/api/leaves/policy');
      if (res.ok) {
        setPolicy(await res.json());
      }
    } catch (err) {
      console.error('Error loading leave policy', err);
    }
  };

  const loadReport = async () => {
    if (!employeeId) return;
    try {
      const res = await fetch(`/api/leaves/report?employee_id=${employeeId}`);
      if (res.ok) {
        setReport(await res.json());
      }
    } catch (err) {
      console.error('Error loading leave report', err);
    }
  };

  // Load a leave report for an arbitrary employee (used in Mark Uninformed view)
  const loadEmployeeReport = async (targetEmployeeId) => {
    if (!targetEmployeeId) return;
    try {
      const res = await fetch(`/api/leaves/report?employee_id=${targetEmployeeId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEmployeeReport(data);
      }
    } catch (err) {
      console.error('Error loading selected employee leave report', err);
    }
  };

  const loadDepartmentLeaves = async () => {
    if (!isManagerOrAdmin) return;
    try {
      const url =
        isAdmin && !departmentId
          ? '/api/leaves/department'
          : `/api/leaves/department?department_id=${departmentId}`;
      const res = await fetch(url, {
        headers: {
          'user-role': user?.role || user?.user_role || (user?.designation || 'employee'),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setDepartmentLeaves({
          pending: data.pending || [],
          recent_approved: data.recent_approved || [],
          recent_rejected: data.recent_rejected || [],
        });
      }
    } catch (err) {
      console.error('Error loading department leaves', err);
    }
  };

  const loadMarkUninformedEmployees = async () => {
    if (!isManagerOrAdmin) return;
    try {
      let url = '/api/employees?all=true';
      if (!isAdmin && user?.department) {
        url += `&department=${encodeURIComponent(user.department)}`;
      }
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setMarkUninformedEmployees(list);
    } catch (err) {
      console.error('Error loading employees for uninformed leave', err);
    }
  };

  useEffect(() => {
    // "My Leaves" – employee self-service view
    if (mode === 'my') {
      loadMyLeaves();
      loadPolicy();
      loadReport();
    }

    // Department view – managers/admins manage department/all employees
    if (mode === 'department') {
      loadDepartmentLeaves();
    }

    // Mark Uninformed – managers/admins mark uninformed leaves for employees
    if (mode === 'markUninformed') {
      loadMarkUninformedEmployees();
    }
  }, [employeeId, departmentId, mode]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const computeDaysRequested = () => {
    if (!form.start_date || !form.end_date) return 0;
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const sameDay = start.toDateString() === end.toDateString();

    // Same-day rules
    if (sameDay) {
      const s = form.start_segment;
      const e = form.end_segment;

      // Any full_day on same day counts as 1 full day
      if (s === 'full_day' || e === 'full_day') return 1;

      // Explicit half‑day ranges
      if (
        (s === 'shift_start' && e === 'shift_middle') ||
        (s === 'shift_middle' && e === 'shift_end')
      ) {
        return 0.5;
      }

      // Start of shift to end of shift = full day
      if (s === 'shift_start' && e === 'shift_end') {
        return 1;
      }

      // Fallback – treat as full day to be safe
      return 1;
    }

    // Multi-day rules: full middle days + boundary contributions
    const msPerDay = 1000 * 60 * 60 * 24;
    const diff = Math.floor((end - start) / msPerDay);
    const middleFullDays = diff > 0 ? Math.max(diff - 1, 0) : 0;

    let total = middleFullDays;

    // First day
    if (form.start_segment === 'full_day') {
      total += 1;
    } else if (form.start_segment === 'shift_start' || form.start_segment === 'shift_middle') {
      total += 0.5;
    }

    // Last day
    if (form.end_segment === 'full_day') {
      total += 1;
    } else if (form.end_segment === 'shift_middle' || form.end_segment === 'shift_end') {
      total += 0.5;
    }

    return total;
  };

  const handleMarkUninformedFormChange = (e) => {
    const { name, value } = e.target;
    setMarkUninformedForm((prev) => ({ ...prev, [name]: value }));

    // When switching employee in Mark Uninformed view, load their current uninformed stats
    if (name === 'employee_id') {
      if (value) {
        loadEmployeeReport(Number(value));
      } else {
        setSelectedEmployeeReport(null);
      }
    }
  };

  const computeMarkUninformedDays = () => {
    if (!markUninformedForm.start_date || !markUninformedForm.end_date) return 0;
    const start = new Date(markUninformedForm.start_date);
    const end = new Date(markUninformedForm.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const sameDay = start.toDateString() === end.toDateString();

    if (sameDay) {
      const s = markUninformedForm.start_segment;
      const e = markUninformedForm.end_segment;

      if (s === 'full_day' || e === 'full_day') return 1;

      if (
        (s === 'shift_start' && e === 'shift_middle') ||
        (s === 'shift_middle' && e === 'shift_end')
      ) {
        return 0.5;
      }

      if (s === 'shift_start' && e === 'shift_end') {
        return 1;
      }

      return 1;
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const diff = Math.floor((end - start) / msPerDay);
    const middleFullDays = diff > 0 ? Math.max(diff - 1, 0) : 0;

    let total = middleFullDays;

    if (markUninformedForm.start_segment === 'full_day') {
      total += 1;
    } else if (
      markUninformedForm.start_segment === 'shift_start' ||
      markUninformedForm.start_segment === 'shift_middle'
    ) {
      total += 0.5;
    }

    if (markUninformedForm.end_segment === 'full_day') {
      total += 1;
    } else if (
      markUninformedForm.end_segment === 'shift_middle' ||
      markUninformedForm.end_segment === 'shift_end'
    ) {
      total += 0.5;
    }

    return total;
  };

  const applyForLeave = async () => {
    if (!employeeId) {
      alert('User is not available for leave application');
      return;
    }
    if (!form.start_date || !form.end_date) {
      alert('Please select start and end dates');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        employee_id: employeeId,
        department_id: departmentId,
        reason: form.reason,
        start_date: form.start_date,
        end_date: form.end_date,
        start_segment: form.start_segment,
        end_segment: form.end_segment,
        days_requested: computeDaysRequested(),
      };

      // First attempt without confirm_exceed flag
      let res = await fetch('/api/leaves/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = await res.json();

      // Handle quota warning
      if (data.over_quota && !data.success) {
        const proceed = window.confirm(
          data.message || 'You only get 2 paid leaves per month. Do you want to proceed?'
        );
        if (!proceed) {
          setLoading(false);
          return;
        }
        res = await fetch('/api/leaves/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, confirm_exceed: true }),
        });
        data = await res.json();
      }

      // Handle department conflict
      if (data.conflict && !data.success) {
        const name = data.existing_employee_name || 'Another employee';
        alert(
          `${name} from your department is already on leave for these dates. Please contact administration.`
        );
        setLoading(false);
        return;
      }

      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to apply for leave');
        setLoading(false);
        return;
      }

      alert('Leave application submitted successfully');
      setForm({
        start_date: '',
        end_date: '',
        start_segment: 'full_day',
        end_segment: 'full_day',
        reason: '',
      });
      await loadMyLeaves();
      await loadReport();
    } catch (err) {
      console.error('Error applying for leave', err);
      alert('Error applying for leave');
    } finally {
      setLoading(false);
    }
  };

  const renderApplyForm = () => {
    const daysRequested = computeDaysRequested();
    return (
      <div className="bg-white border rounded p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={user?.name || ''}
              disabled
              className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <input
              type="text"
              value={user?.department || ''}
              disabled
              className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input
              type="date"
              name="start_date"
              value={form.start_date}
              onChange={handleFormChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
            <input
              type="date"
              name="end_date"
              value={form.end_date}
              onChange={handleFormChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start of leave</label>
            <select
              name="start_segment"
              value={form.start_segment}
              onChange={handleFormChange}
              className="w-full border rounded px-3 py-2"
            >
              <option value="shift_start">Start of shift</option>
              <option value="shift_middle">Middle of shift</option>
              <option value="full_day">Full day</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End of leave</label>
            <select
              name="end_segment"
              value={form.end_segment}
              onChange={handleFormChange}
              className="w-full border rounded px-3 py-2"
            >
              <option value="shift_middle">Middle of shift</option>
              <option value="shift_end">End of shift</option>
              <option value="full_day">Full day</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <textarea
            name="reason"
            value={form.reason}
            onChange={handleFormChange}
            rows={3}
            className="w-full border rounded px-3 py-2"
            placeholder="Describe the reason for your leave"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Days requested: <span className="font-semibold">{daysRequested}</span>
          </div>
          <button
            type="button"
            onClick={applyForLeave}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Apply for Leave'}
          </button>
        </div>
      </div>
    );
  };

  const openLeaveDetails = (row) => {
    setSelectedLeaveForDetails(row);
  };

  const filterByCommonCriteria = (rows, filters) => {
    return rows.filter((row) => {
      const start = row.start_date ? new Date(row.start_date) : null;
      const end = row.end_date ? new Date(row.end_date) : null;
      const days = Number(row.days_requested) || 0;

      if (filters.startDate) {
        const from = new Date(filters.startDate);
        if (start && start < from) return false;
      }
      if (filters.endDate) {
        const to = new Date(filters.endDate);
        if (end && end > to) return false;
      }
      if (filters.minDays && !Number.isNaN(Number(filters.minDays))) {
        if (days < Number(filters.minDays)) return false;
      }
      if (filters.maxDays && !Number.isNaN(Number(filters.maxDays))) {
        if (days > Number(filters.maxDays)) return false;
      }
      if (filters.type === 'regular' && row.is_uninformed) return false;
      if (filters.type === 'uninformed' && !row.is_uninformed) return false;

      return true;
    });
  };

  const renderLeaveTable = (rows) => (
    <div className="bg-white border rounded p-4">
      {rows.length === 0 ? (
        <div className="text-gray-500 text-sm">No records.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Dates</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Segments</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Days</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Paid</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Type</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Reason</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Decision</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-gray-800">
                    {formatDate(row.start_date)}{' '}
                    {row.start_date !== row.end_date ? `→ ${formatDate(row.end_date)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.start_segment} → {row.end_segment}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{row.days_requested}</td>
                  <td className="px-4 py-2 text-gray-800">{row.is_paid ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.is_uninformed ? (
                      <span className="inline-flex px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                        Uninformed
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        Regular
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{row.reason}</td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.status}
                    {row.decision_reason ? ` – ${row.decision_reason}` : ''}
                    {row.status !== 'pending' && row.decision_by_name
                      ? ` (by ${row.decision_by_name})`
                      : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    <button
                      type="button"
                      onClick={() => openLeaveDetails(row)}
                      className="px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const handleDecision = async (id, newStatus) => {
    if (!isManagerOrAdmin) return;
    const confirmMsg =
      newStatus === 'approved'
        ? 'Approve this leave request?'
        : 'Reject this leave request?';
    if (!window.confirm(confirmMsg)) return;
    try {
      const body = {
        status: newStatus,
        decision_by: user?.id || null,
      };
      const res = await fetch(`/api/leaves/${id}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || user?.user_role || (user?.designation || 'employee'),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to update leave decision');
        return;
      }
      await loadDepartmentLeaves();
      await loadMyLeaves();
      await loadReport();
    } catch (err) {
      console.error('Error updating leave decision', err);
      alert('Error updating leave decision');
    }
  };

  const handleMarkUninformed = async (row) => {
    if (!isManagerOrAdmin) return;
    const reason = window.prompt(
      'Enter reason for marking uninformed leave:',
      'Uninformed leave'
    );
    if (reason === null) return;
    try {
      const res = await fetch('/api/leaves/mark-uninformed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || user?.user_role || (user?.designation || 'employee'),
        },
        body: JSON.stringify({
          employee_id: row.employee_id,
          start_date: row.start_date,
          end_date: row.end_date || row.start_date,
          start_segment: row.start_segment || 'full_day',
          end_segment: row.end_segment || 'full_day',
          days_requested: Number(row.days_requested) || 1,
          reason,
          decision_by: user?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to mark uninformed leave');
        return;
      }
      await loadDepartmentLeaves();
      await loadMyLeaves();
      await loadReport();
    } catch (err) {
      console.error('Error marking uninformed leave', err);
      alert('Error marking uninformed leave');
    }
  };

  const submitMarkUninformedForm = async () => {
    if (!isManagerOrAdmin) return;
    if (!markUninformedForm.employee_id || !markUninformedForm.start_date || !markUninformedForm.end_date) {
      alert('Please select employee and start/end dates');
      return;
    }
    const daysRequested = computeMarkUninformedDays();
    if (daysRequested <= 0) {
      alert('Invalid date range for uninformed leave');
      return;
    }
    try {
      const res = await fetch('/api/leaves/mark-uninformed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || user?.user_role || (user?.designation || 'employee'),
        },
        body: JSON.stringify({
          employee_id: Number(markUninformedForm.employee_id),
          start_date: markUninformedForm.start_date,
          end_date: markUninformedForm.end_date,
          start_segment: markUninformedForm.start_segment,
          end_segment: markUninformedForm.end_segment,
          days_requested: daysRequested,
          reason: markUninformedForm.reason || 'Uninformed leave',
          decision_by: user?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to mark uninformed leave');
        return;
      }
      alert('Uninformed leave recorded successfully');
      setMarkUninformedForm({
        employee_id: '',
        start_date: '',
        end_date: '',
        start_segment: 'full_day',
        end_segment: 'full_day',
        reason: 'Uninformed leave',
      });
      await loadDepartmentLeaves();
      await loadMyLeaves();
      await loadReport();
    } catch (err) {
      console.error('Error marking uninformed leave via form', err);
      alert('Error marking uninformed leave');
    }
  };

  const renderDepartmentTable = (rows, showActions) => {
    const filtered = rows
      .filter((row) => {
        if (!departmentSearch) return true;
        const name = row.employee_name || '';
        const reason = row.reason || '';
        return (
          name.toLowerCase().includes(departmentSearch.toLowerCase()) ||
          reason.toLowerCase().includes(departmentSearch.toLowerCase())
        );
      })
      .filter((row) => filterByCommonCriteria([row], deptFilters).length === 1);

    return (
      <div className="bg-white border rounded p-4">
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-600">
              Showing {filtered.length} of {rows.length} records
            </div>
            <input
              type="text"
              value={departmentSearch}
              onChange={(e) => setDepartmentSearch(e.target.value)}
              placeholder="Search by employee or reason..."
              className="border rounded px-3 py-1.5 text-sm w-64"
            />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-700">
            <div>
              <label className="block mb-1 font-medium">From</label>
              <input
                type="date"
                value={deptFilters.startDate}
                onChange={(e) =>
                  setDeptFilters((f) => ({ ...f, startDate: e.target.value }))
                }
                className="border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">To</label>
              <input
                type="date"
                value={deptFilters.endDate}
                onChange={(e) =>
                  setDeptFilters((f) => ({ ...f, endDate: e.target.value }))
                }
                className="border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Min days</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={deptFilters.minDays}
                onChange={(e) =>
                  setDeptFilters((f) => ({ ...f, minDays: e.target.value }))
                }
                className="border rounded px-2 py-1 w-20"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Max days</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={deptFilters.maxDays}
                onChange={(e) =>
                  setDeptFilters((f) => ({ ...f, maxDays: e.target.value }))
                }
                className="border rounded px-2 py-1 w-20"
              />
            </div>
            <div>
              <label className="block mb-1 font-medium">Type</label>
              <select
                value={deptFilters.type}
                onChange={(e) =>
                  setDeptFilters((f) => ({ ...f, type: e.target.value }))
                }
                className="border rounded px-2 py-1"
              >
                <option value="all">All</option>
                <option value="regular">Regular</option>
                <option value="uninformed">Uninformed</option>
              </select>
            </div>
            <button
              type="button"
              className="ml-auto text-[11px] text-indigo-600 underline"
              onClick={() =>
                setDeptFilters({
                  startDate: '',
                  endDate: '',
                  minDays: '',
                  maxDays: '',
                  type: 'all',
                })
              }
            >
              Clear filters
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="text-gray-500 text-sm">No records.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Employee</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Department</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Dates</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Days</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Type</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                {showActions && (
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Actions</th>
                )}
                {!showActions && (
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Details</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-gray-800">
                    {row.employee_name || row.employee_id}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {formatDate(row.start_date)}{' '}
                    {row.start_date !== row.end_date ? `→ ${formatDate(row.end_date)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{row.days_requested}</td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.is_uninformed ? (
                      <span className="inline-flex px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                        Uninformed
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        Regular
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.status}
                    {row.status !== 'pending' && row.decision_by_name
                      ? ` (by ${row.decision_by_name})`
                      : ''}
                  </td>
                  {showActions && (
                    <td className="px-4 py-2 text-gray-800 space-x-2">
                      {row.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDecision(row.id, 'approved')}
                            className="px-2 py-1 text-xs rounded bg-green-600 text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(row.id, 'rejected')}
                            className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleMarkUninformed(row)}
                        className="px-2 py-1 text-xs rounded bg-yellow-500 text-white"
                      >
                        Mark Uninformed
                      </button>
                    </td>
                  )}
                  {!showActions && (
                    <td className="px-4 py-2 text-gray-800">
                      <button
                        type="button"
                        onClick={() => openLeaveDetails(row)}
                        className="px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      >
                        View
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    );
  };

  const formatDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderPolicy = () => (
    <div className="bg-white border rounded p-6 text-gray-700 space-y-2">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Leave Policy</h2>
      <p>
        Monthly paid leave quota:{' '}
        <span className="font-semibold">{policy?.monthly_paid_quota ?? 2}</span> days.
      </p>
      <p>
        {policy?.uninformed_penalty_text ||
          'If you take uninformed leaves, paid leave quotas in future months will be reduced until all uninformed days have been deducted. No leaves this month will be paid out in money.'}
      </p>
    </div>
  );

  const renderReport = () => {
    if (!report) {
      return (
        <div className="bg-white border rounded p-6 text-gray-600">
          Leave report is not available.
        </div>
      );
    }
    return (
      <div className="bg-white border rounded p-6 text-gray-700 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">My Leave Report</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Paid leaves summary */}
          <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Paid Leaves
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {report.remaining_paid}
              <span className="ml-1 text-sm font-medium text-gray-500">remaining</span>
            </div>
            <div className="text-xs text-gray-600 space-y-1">
              <div>
                <span className="font-medium text-gray-700">Base quota:</span>{' '}
                {report.paid_quota}
              </div>
              <div>
                <span className="font-medium text-gray-700">Effective after deductions:</span>{' '}
                {report.effective_quota ??
                  Math.max(0, (report.paid_quota || 0) - (report.next_month_deduction || 0))}
              </div>
              <div>
                <span className="font-medium text-gray-700">Used:</span> {report.paid_used}
              </div>
            </div>
          </div>

          {/* Uninformed count */}
          <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              Uninformed Leaves
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {report.uninformed_count}
              <span className="ml-1 text-sm font-medium text-gray-500">total</span>
            </div>
            <div className="text-xs text-gray-600">
              Uninformed leaves reduce future paid leave quotas until fully recovered.
            </div>
          </div>

          {/* Upcoming deductions */}
          <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-red-600">
              Upcoming Deductions
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {report.total_future_deduction ?? 0}
              <span className="ml-1 text-sm font-medium text-gray-500">day(s)</span>
            </div>
            {Array.isArray(report.future_deductions) && report.future_deductions.length > 0 ? (
              <div className="mt-2 text-xs text-gray-700">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="pr-2 py-1 font-medium">Month</th>
                      <th className="py-1 font-medium text-right">Days deducted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.future_deductions.slice(0, 4).map((row) => (
                      <tr key={`${row.year}-${row.month}`}>
                        <td className="pr-2 py-0.5">
                          {String(row.month).padStart(2, '0')}/{row.year}
                        </td>
                        <td className="py-0.5 text-right font-semibold">
                          {row.next_month_deduction}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.future_deductions.length > 4 && (
                  <div className="mt-1 text-[11px] text-gray-500">
                    + more months of deductions
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 mt-1">
                No future deductions scheduled from uninformed leaves.
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Uninformed leave details</h3>
            <div className="flex flex-wrap gap-2 text-xs text-gray-700">
              <div>
                <label className="block mb-1 font-medium">From</label>
                <input
                  type="date"
                  value={uninformedReportFilters.startDate}
                  onChange={(e) =>
                    setUninformedReportFilters((f) => ({ ...f, startDate: e.target.value }))
                  }
                  className="border rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">To</label>
                <input
                  type="date"
                  value={uninformedReportFilters.endDate}
                  onChange={(e) =>
                    setUninformedReportFilters((f) => ({ ...f, endDate: e.target.value }))
                  }
                  className="border rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Min days</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={uninformedReportFilters.minDays}
                  onChange={(e) =>
                    setUninformedReportFilters((f) => ({ ...f, minDays: e.target.value }))
                  }
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Max days</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={uninformedReportFilters.maxDays}
                  onChange={(e) =>
                    setUninformedReportFilters((f) => ({ ...f, maxDays: e.target.value }))
                  }
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
              <button
                type="button"
                className="self-end text-[11px] text-indigo-600 underline"
                onClick={() =>
                  setUninformedReportFilters({
                    startDate: '',
                    endDate: '',
                    minDays: '',
                    maxDays: '',
                  })
                }
              >
                Clear
              </button>
            </div>
          </div>
          {report.uninformed_details && report.uninformed_details.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm bg-white border rounded">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Dates</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Days</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Reason</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Marked by</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Marked at</th>
                    {isManagerOrAdmin && (
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filterByCommonCriteria(report.uninformed_details, {
                    ...uninformedReportFilters,
                    type: 'uninformed',
                  }).map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-2 text-gray-800">
                        {formatDate(u.start_date)}
                        {u.start_date !== u.end_date ? ` – ${formatDate(u.end_date)}` : ''}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {Number(u.days_requested).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {u.reason || 'Uninformed leave'}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {u.recorded_by_name || '-'}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {u.decision_at ? formatDateTime(u.decision_at) : '-'}
                      </td>
                      {isManagerOrAdmin && (
                        <td className="px-4 py-2 text-gray-800">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm('Delete this uninformed leave?')) return;
                              try {
                                const res = await fetch(`/api/leaves/uninformed/${u.id}`, {
                                  method: 'DELETE',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'user-role':
                                      user?.role ||
                                      user?.user_role ||
                                      (user?.designation || 'employee'),
                                  },
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok || !data.success) {
                                  alert(data.error || 'Failed to delete uninformed leave');
                                  return;
                                }
                                await loadReport();
                              } catch (err) {
                                console.error('Error deleting uninformed leave', err);
                                alert('Error deleting uninformed leave');
                              }
                            }}
                            className="inline-flex items-center px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No uninformed leaves recorded for this period.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMarkUninformedForm = () => {
    if (!isManagerOrAdmin) return null;
    const daysRequested = computeMarkUninformedDays();
    return (
      <div className="bg-white border rounded p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Mark Uninformed Leave</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div ref={uninformedEmployeeDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={uninformedDepartmentFilter}
              onChange={(e) => setUninformedDepartmentFilter(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-2"
            >
              <option value="">All departments</option>
              {Array.from(
                new Set(
                  markUninformedEmployees
                    .map((emp) => emp.department)
                    .filter((d) => d && d.trim().length > 0)
                )
              ).map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <div className="relative">
              <input
                type="text"
                value={
                  uninformedEmployeeDropdownOpen
                    ? uninformedEmployeeSearch
                    : (() => {
                        const selected = markUninformedEmployees.find(
                          (emp) => String(emp.id) === String(markUninformedForm.employee_id)
                        );
                        return selected
                          ? `${selected.name}${selected.department ? ` (${selected.department})` : ''}`
                          : '';
                      })()
                }
                onChange={(e) => {
                  setUninformedEmployeeSearch(e.target.value);
                  setUninformedEmployeeDropdownOpen(true);
                  if (!e.target.value) {
                    setMarkUninformedForm((prev) => ({ ...prev, employee_id: '' }));
                    setSelectedEmployeeReport(null);
                  }
                }}
                onFocus={() => {
                  setUninformedEmployeeDropdownOpen(true);
                  const selected = markUninformedEmployees.find(
                    (emp) => String(emp.id) === String(markUninformedForm.employee_id)
                  );
                  setUninformedEmployeeSearch(selected?.name || '');
                }}
                placeholder="Type employee name..."
                className="w-full border rounded px-3 py-2 pr-8"
                autoComplete="off"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                ▼
              </span>
              {uninformedEmployeeDropdownOpen && (
                <ul className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-300 rounded-lg shadow-lg py-1">
                  {markUninformedEmployees
                    .filter((emp) => {
                      const matchesDept =
                        !uninformedDepartmentFilter || emp.department === uninformedDepartmentFilter;
                      const matchesSearch =
                        !uninformedEmployeeSearch ||
                        (emp.name || '')
                          .toLowerCase()
                          .includes(uninformedEmployeeSearch.toLowerCase());
                      return matchesDept && matchesSearch;
                    })
                    .map((emp) => (
                      <li
                        key={emp.id}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50"
                        onClick={() => {
                          setMarkUninformedForm((prev) => ({
                            ...prev,
                            employee_id: String(emp.id),
                          }));
                          setUninformedEmployeeSearch('');
                          setUninformedEmployeeDropdownOpen(false);
                          loadEmployeeReport(Number(emp.id));
                        }}
                      >
                        {emp.name} {emp.department ? `(${emp.department})` : ''}
                      </li>
                    ))}
                  {markUninformedEmployees.filter((emp) => {
                    const matchesDept =
                      !uninformedDepartmentFilter || emp.department === uninformedDepartmentFilter;
                    const matchesSearch =
                      !uninformedEmployeeSearch ||
                      (emp.name || '')
                        .toLowerCase()
                        .includes(uninformedEmployeeSearch.toLowerCase());
                    return matchesDept && matchesSearch;
                  }).length === 0 && (
                    <li className="px-3 py-2 text-sm text-gray-500">No employees found</li>
                  )}
                </ul>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input
              type="text"
              name="reason"
              value={markUninformedForm.reason}
              onChange={handleMarkUninformedFormChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
            <input
              type="date"
              name="start_date"
              value={markUninformedForm.start_date}
              onChange={handleMarkUninformedFormChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
            <input
              type="date"
              name="end_date"
              value={markUninformedForm.end_date}
              onChange={handleMarkUninformedFormChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start of shift</label>
            <select
              name="start_segment"
              value={markUninformedForm.start_segment}
              onChange={handleMarkUninformedFormChange}
              className="w-full border rounded px-3 py-2"
            >
              <option value="shift_start">Start of shift</option>
              <option value="shift_middle">Middle of shift</option>
              <option value="full_day">Full day</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End of shift</label>
            <select
              name="end_segment"
              value={markUninformedForm.end_segment}
              onChange={handleMarkUninformedFormChange}
              className="w-full border rounded px-3 py-2"
            >
              <option value="shift_middle">Middle of shift</option>
              <option value="shift_end">End of shift</option>
              <option value="full_day">Full day</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Days (uninformed) to record:{' '}
            <span className="font-semibold">{daysRequested}</span>
          </div>
          <button
            type="button"
            onClick={submitMarkUninformedForm}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700"
          >
            Save Uninformed Leave
          </button>
        </div>
      </div>
    );
  };

  // "My Leaves" – completely self-contained employee view
  const renderMyLeavesContent = () => {
    switch (activeTab) {
      case TABS.APPLY:
        return renderApplyForm();
      case TABS.PENDING: {
        const rows = filterByCommonCriteria(myLeaves.pending || [], myFilters);
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">My pending leaves</h2>
            <div className="flex flex-wrap gap-3 text-xs text-gray-700 bg-white border rounded px-4 py-3">
              <div>
                <label className="block mb-1 font-medium">From</label>
                <input
                  type="date"
                  value={myFilters.startDate}
                  onChange={(e) => setMyFilters((f) => ({ ...f, startDate: e.target.value }))}
                  className="border rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">To</label>
                <input
                  type="date"
                  value={myFilters.endDate}
                  onChange={(e) => setMyFilters((f) => ({ ...f, endDate: e.target.value }))}
                  className="border rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Min days</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={myFilters.minDays}
                  onChange={(e) => setMyFilters((f) => ({ ...f, minDays: e.target.value }))}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Max days</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={myFilters.maxDays}
                  onChange={(e) => setMyFilters((f) => ({ ...f, maxDays: e.target.value }))}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
              <div>
                <label className="block mb-1 font-medium">Type</label>
                <select
                  value={myFilters.type}
                  onChange={(e) => setMyFilters((f) => ({ ...f, type: e.target.value }))}
                  className="border rounded px-2 py-1"
                >
                  <option value="all">All</option>
                  <option value="regular">Regular</option>
                  <option value="uninformed">Uninformed</option>
                </select>
              </div>
              <button
                type="button"
                className="ml-auto text-[11px] text-indigo-600 underline"
                onClick={() =>
                  setMyFilters({ startDate: '', endDate: '', minDays: '', maxDays: '', type: 'all' })
                }
              >
                Clear filters
              </button>
            </div>
            {renderLeaveTable(rows)}
          </div>
        );
      }
      case TABS.APPROVED: {
        const rows = filterByCommonCriteria(myLeaves.recent_approved || [], myFilters);
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">My recent approved leaves</h2>
            {renderLeaveTable(rows)}
          </div>
        );
      }
      case TABS.REJECTED: {
        const rows = filterByCommonCriteria(myLeaves.recent_rejected || [], myFilters);
        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">My recent rejected leaves</h2>
            {renderLeaveTable(rows)}
          </div>
        );
      }
      case TABS.POLICY:
        return renderPolicy();
      case TABS.REPORT:
        return renderReport();
      default:
        return null;
    }
  };

  // Department view – managers/admins manage pending/approved/rejected for their department / all employees
  const renderDepartmentContent = () => {
    switch (departmentTab) {
      case TABS.PENDING:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Department pending leaves</h2>
            {renderDepartmentTable(departmentLeaves.pending || [], true)}
          </div>
        );
      case TABS.APPROVED:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Department recent approved leaves</h2>
            {renderDepartmentTable(departmentLeaves.recent_approved || [], false)}
          </div>
        );
      case TABS.REJECTED:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Department recent rejected leaves</h2>
            {renderDepartmentTable(departmentLeaves.recent_rejected || [], false)}
          </div>
        );
      default:
        return null;
    }
  };

  // Mark Uninformed view – managers/admins mark uninformed and see how many have been marked
  const renderMarkUninformedContent = () => {
    if (!isManagerOrAdmin) {
      return (
        <div className="bg-white border rounded p-6 text-gray-700">
          You do not have permission to mark uninformed leaves.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>{renderMarkUninformedForm()}</div>
          <div className="bg-white border rounded p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Uninformed leaves for selected employee
            </h2>
            {!markUninformedForm.employee_id ? (
              <div className="text-sm text-gray-500">
                Select an employee to see how many uninformed leaves have been recorded for them.
              </div>
            ) : !selectedEmployeeReport ? (
              <div className="text-sm text-gray-500">
                Loading or no report available for this employee.
              </div>
            ) : (
              <div className="space-y-4 text-sm text-gray-700">
                <div className="border rounded p-3">
                  <div className="text-xs uppercase text-gray-500">Uninformed Leaves Count</div>
                  <div className="mt-1 text-sm">
                    <span className="font-semibold">
                      {selectedEmployeeReport.uninformed_count}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Uninformed leave details
                    </h3>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-700">
                      <div>
                        <label className="block mb-1 font-medium">From</label>
                        <input
                          type="date"
                          value={markUninformedFilters.startDate}
                          onChange={(e) =>
                            setMarkUninformedFilters((f) => ({
                              ...f,
                              startDate: e.target.value,
                            }))
                          }
                          className="border rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 font-medium">To</label>
                        <input
                          type="date"
                          value={markUninformedFilters.endDate}
                          onChange={(e) =>
                            setMarkUninformedFilters((f) => ({
                              ...f,
                              endDate: e.target.value,
                            }))
                          }
                          className="border rounded px-2 py-1"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 font-medium">Min days</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={markUninformedFilters.minDays}
                          onChange={(e) =>
                            setMarkUninformedFilters((f) => ({
                              ...f,
                              minDays: e.target.value,
                            }))
                          }
                          className="border rounded px-2 py-1 w-20"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 font-medium">Max days</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={markUninformedFilters.maxDays}
                          onChange={(e) =>
                            setMarkUninformedFilters((f) => ({
                              ...f,
                              maxDays: e.target.value,
                            }))
                          }
                          className="border rounded px-2 py-1 w-20"
                        />
                      </div>
                      <button
                        type="button"
                        className="self-end text-[11px] text-indigo-600 underline"
                        onClick={() =>
                          setMarkUninformedFilters({
                            startDate: '',
                            endDate: '',
                            minDays: '',
                            maxDays: '',
                          })
                        }
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  {selectedEmployeeReport.uninformed_details &&
                  selectedEmployeeReport.uninformed_details.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm bg-white border rounded">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">
                              Dates
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">
                              Days
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">
                              Reason
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">
                              Marked by
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">
                              Marked at
                            </th>
                            {isManagerOrAdmin && (
                              <th className="px-3 py-2 text-left font-medium text-gray-700">
                                Actions
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filterByCommonCriteria(
                            selectedEmployeeReport.uninformed_details,
                            { ...markUninformedFilters, type: 'uninformed' }
                          ).map((u) => (
                            <tr key={u.id}>
                              <td className="px-3 py-2 text-gray-800">
                                {formatDate(u.start_date)}
                                {u.start_date !== u.end_date
                                  ? ` – ${formatDate(u.end_date)}`
                                  : ''}
                              </td>
                              <td className="px-3 py-2 text-gray-800">
                                {Number(u.days_requested).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-gray-800">
                                {u.reason || 'Uninformed leave'}
                              </td>
                              <td className="px-3 py-2 text-gray-800">
                                {u.recorded_by_name || '-'}
                              </td>
                              <td className="px-3 py-2 text-gray-800">
                                {u.decision_at ? formatDateTime(u.decision_at) : '-'}
                              </td>
                              {isManagerOrAdmin && (
                                <td className="px-3 py-2 text-gray-800">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!window.confirm('Delete this uninformed leave?')) return;
                                      try {
                                        const res = await fetch(
                                          `/api/leaves/uninformed/${u.id}`,
                                          {
                                            method: 'DELETE',
                                            headers: {
                                              'Content-Type': 'application/json',
                                              'user-role':
                                                user?.role ||
                                                user?.user_role ||
                                                (user?.designation || 'employee'),
                                            },
                                          }
                                        );
                                        const data = await res.json().catch(() => ({}));
                                        if (!res.ok || !data.success) {
                                          alert(data.error || 'Failed to delete uninformed leave');
                                          return;
                                        }
                                        // Reload both selected employee report and main report
                                        await loadEmployeeReport(
                                          Number(markUninformedForm.employee_id)
                                        );
                                        await loadReport();
                                      } catch (err) {
                                        console.error('Error deleting uninformed leave', err);
                                        alert('Error deleting uninformed leave');
                                      }
                                    }}
                                    className="inline-flex items-center px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                                  >
                                    Delete
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      No uninformed leaves recorded for this employee.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Completely separate top-level UIs per subsection
  if (mode === 'department') {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Department Leaves</h1>
        <div className="mb-4 border-b border-gray-200">
          <nav className="-mb-px flex space-x-4" aria-label="Tabs">
            {[TABS.PENDING, TABS.APPROVED, TABS.REJECTED].map((tabId) => {
              const label =
                tabId === TABS.PENDING
                  ? 'Pending'
                  : tabId === TABS.APPROVED
                  ? 'Approved'
                  : 'Rejected';
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setDepartmentTab(tabId)}
                  className={`whitespace-nowrap py-2 px-3 border-b-2 text-sm font-medium ${
                    departmentTab === tabId
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
        {renderDepartmentContent()}
      </div>
    );
  }

  if (mode === 'markUninformed') {
    return (
      <>
        <div className="p-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">Mark Uninformed Leaves</h1>
          {renderMarkUninformedContent()}
        </div>
        {selectedLeaveForDetails && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Leave Details</h2>
              <div className="space-y-2 text-sm text-gray-700">
                {selectedLeaveForDetails.employee_name && (
                  <div>
                    <span className="font-semibold">Employee:</span>{' '}
                    {selectedLeaveForDetails.employee_name}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Dates:</span>{' '}
                  {formatDate(selectedLeaveForDetails.start_date)}
                  {selectedLeaveForDetails.start_date !== selectedLeaveForDetails.end_date
                    ? ` – ${formatDate(selectedLeaveForDetails.end_date)}`
                    : ''}
                </div>
                {selectedLeaveForDetails.start_segment && (
                  <div>
                    <span className="font-semibold">Segments:</span>{' '}
                    {selectedLeaveForDetails.start_segment} →{' '}
                    {selectedLeaveForDetails.end_segment}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Days:</span>{' '}
                  {Number(selectedLeaveForDetails.days_requested).toFixed(2)}
                </div>
                {selectedLeaveForDetails.status && (
                  <div>
                    <span className="font-semibold">Status:</span>{' '}
                    {selectedLeaveForDetails.status}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Paid:</span>{' '}
                  {selectedLeaveForDetails.is_paid ? 'Yes' : 'No'}
                </div>
                <div>
                  <span className="font-semibold">Uninformed:</span>{' '}
                  {selectedLeaveForDetails.is_uninformed ? 'Yes' : 'No'}
                </div>
                {selectedLeaveForDetails.reason && (
                  <div>
                    <span className="font-semibold">Reason:</span>{' '}
                    {selectedLeaveForDetails.reason}
                  </div>
                )}
                {selectedLeaveForDetails.decision_reason && (
                  <div>
                    <span className="font-semibold">Decision notes:</span>{' '}
                    {selectedLeaveForDetails.decision_reason}
                  </div>
                )}
                {selectedLeaveForDetails.created_at && (
                  <div>
                    <span className="font-semibold">Applied at:</span>{' '}
                    {formatDateTime(selectedLeaveForDetails.created_at)}
                  </div>
                )}
                {selectedLeaveForDetails.decision_at && (
                  <div>
                    <span className="font-semibold">Decided at:</span>{' '}
                    {formatDateTime(selectedLeaveForDetails.decision_at)}
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedLeaveForDetails(null)}
                  className="px-4 py-2 text-sm rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Default: "My Leaves" – self-service employee view (for employees, managers, admins)
  return (
    <>
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">My Leaves</h1>
        <div className="mb-4 border-b border-gray-200">
          <nav className="-mb-px flex space-x-4" aria-label="Tabs">
            {[
              { id: TABS.APPLY, label: 'Apply for Leave' },
              { id: TABS.PENDING, label: 'Pending Approval' },
              { id: TABS.APPROVED, label: 'Recent Approved' },
              { id: TABS.REJECTED, label: 'Recent Rejected' },
              { id: TABS.POLICY, label: 'Leave Policy' },
              { id: TABS.REPORT, label: 'My Leave Report' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-2 px-3 border-b-2 text-sm font-medium ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        {renderMyLeavesContent()}
      </div>
      {selectedLeaveForDetails && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Leave Details</h2>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="font-semibold">Dates:</span>{' '}
                {formatDate(selectedLeaveForDetails.start_date)}
                {selectedLeaveForDetails.start_date !== selectedLeaveForDetails.end_date
                  ? ` – ${formatDate(selectedLeaveForDetails.end_date)}`
                  : ''}
              </div>
              {selectedLeaveForDetails.start_segment && (
                <div>
                  <span className="font-semibold">Segments:</span>{' '}
                  {selectedLeaveForDetails.start_segment} →{' '}
                  {selectedLeaveForDetails.end_segment}
                </div>
              )}
              <div>
                <span className="font-semibold">Days:</span>{' '}
                {Number(selectedLeaveForDetails.days_requested).toFixed(2)}
              </div>
              {selectedLeaveForDetails.status && (
                <div>
                  <span className="font-semibold">Status:</span>{' '}
                  {selectedLeaveForDetails.status}
                </div>
              )}
              {selectedLeaveForDetails.status &&
                selectedLeaveForDetails.status !== 'pending' &&
                selectedLeaveForDetails.decision_by_name && (
                  <div>
                    <span className="font-semibold">Decided by:</span>{' '}
                    {selectedLeaveForDetails.decision_by_name}
                  </div>
                )}
              <div>
                <span className="font-semibold">Paid:</span>{' '}
                {selectedLeaveForDetails.is_paid ? 'Yes' : 'No'}
              </div>
              <div>
                <span className="font-semibold">Uninformed:</span>{' '}
                {selectedLeaveForDetails.is_uninformed ? 'Yes' : 'No'}
              </div>
              {selectedLeaveForDetails.reason && (
                <div>
                  <span className="font-semibold">Reason:</span>{' '}
                  {selectedLeaveForDetails.reason}
                </div>
              )}
              {selectedLeaveForDetails.decision_reason && (
                <div>
                  <span className="font-semibold">Decision notes:</span>{' '}
                  {selectedLeaveForDetails.decision_reason}
                </div>
              )}
              {selectedLeaveForDetails.created_at && (
                <div>
                  <span className="font-semibold">Applied at:</span>{' '}
                  {formatDateTime(selectedLeaveForDetails.created_at)}
                </div>
              )}
              {selectedLeaveForDetails.decision_at && (
                <div>
                  <span className="font-semibold">Decided at:</span>{' '}
                  {formatDateTime(selectedLeaveForDetails.decision_at)}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLeaveForDetails(null)}
                className="px-4 py-2 text-sm rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}












