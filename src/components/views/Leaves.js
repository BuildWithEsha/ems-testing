import React, { useState, useEffect } from 'react';
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
      const url = isAdmin && !departmentId
        ? '/api/leaves/department'
        : `/api/leaves/department?department_id=${departmentId}`;
      const res = await fetch(url);
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
                <th className="px-4 py-2 text-left font-medium text-gray-700">Reason</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-gray-800">
                    {row.start_date} {row.start_date !== row.end_date ? `→ ${row.end_date}` : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.start_segment} → {row.end_segment}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{row.days_requested}</td>
                  <td className="px-4 py-2 text-gray-800">{row.is_paid ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2 text-gray-800">{row.reason}</td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.status}
                    {row.decision_reason ? ` – ${row.decision_reason}` : ''}
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
      await loadReport();
    } catch (err) {
      console.error('Error marking uninformed leave via form', err);
      alert('Error marking uninformed leave');
    }
  };

  const renderDepartmentTable = (rows, showActions) => (
    <div className="bg-white border rounded p-4">
      {rows.length === 0 ? (
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
                <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                {showActions && (
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2 text-gray-800">
                    {row.employee_name || row.employee_id}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {row.start_date} {row.start_date !== row.end_date ? `→ ${row.end_date}` : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-800">{row.days_requested}</td>
                  <td className="px-4 py-2 text-gray-800">{row.status}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

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
          <div className="border rounded p-3">
            <div className="text-xs uppercase text-gray-500">Paid Leaves</div>
            <div className="mt-1 text-sm">
              Base quota:{' '}
              <span className="font-semibold">
                {report.paid_quota}
              </span>
            </div>
            <div className="text-sm">
              Effective quota after deductions:{' '}
              <span className="font-semibold">
                {report.effective_quota ?? Math.max(0, (report.paid_quota || 0) - (report.next_month_deduction || 0))}
              </span>
            </div>
            <div className="text-sm">
              Used:{' '}
              <span className="font-semibold">
                {report.paid_used}
              </span>
            </div>
            <div className="text-sm">
              Remaining:{' '}
              <span className="font-semibold">
                {report.remaining_paid}
              </span>
            </div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs uppercase text-gray-500">Uninformed Leaves</div>
            <div className="mt-1 text-sm">
              Count:{' '}
              <span className="font-semibold">
                {report.uninformed_count}
              </span>
            </div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs uppercase text-gray-500">This Month Deduction</div>
            <div className="mt-1 text-sm">
              Days to deduct:{' '}
              <span className="font-semibold">
                {report.next_month_deduction}
              </span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Uninformed leave details</h3>
          {report.uninformed_details && report.uninformed_details.length > 0 ? (
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              {report.uninformed_details.map((u) => (
                <li key={u.id}>
                  {u.start_date}
                  {u.start_date !== u.end_date ? ` to ${u.end_date}` : ''} – {u.days_requested} day(s)
                  {u.reason ? ` – ${u.reason}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-500">No uninformed leaves recorded for this period.</div>
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
          <div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Employee</label>
            <input
              type="text"
              value={uninformedEmployeeSearch}
              onChange={(e) => setUninformedEmployeeSearch(e.target.value)}
              placeholder="Type name to search..."
              className="w-full border rounded px-3 py-2 mb-2"
            />
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select
              name="employee_id"
              value={markUninformedForm.employee_id}
              onChange={handleMarkUninformedFormChange}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select employee</option>
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
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.department ? `(${emp.department})` : ''}
                  </option>
                ))}
            </select>
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
      case TABS.PENDING:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">My pending leaves</h2>
            {renderLeaveTable(myLeaves.pending || [])}
          </div>
        );
      case TABS.APPROVED:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">My recent approved leaves</h2>
            {renderLeaveTable(myLeaves.recent_approved || [])}
          </div>
        );
      case TABS.REJECTED:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">My recent rejected leaves</h2>
            {renderLeaveTable(myLeaves.recent_rejected || [])}
          </div>
        );
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
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">
                    Uninformed leave details
                  </h3>
                  {selectedEmployeeReport.uninformed_details &&
                  selectedEmployeeReport.uninformed_details.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1">
                      {selectedEmployeeReport.uninformed_details.map((u) => (
                        <li key={u.id}>
                          {u.start_date}
                          {u.start_date !== u.end_date ? ` to ${u.end_date}` : ''} –{' '}
                          {u.days_requested} day(s)
                          {u.reason ? ` – ${u.reason}` : ''}
                        </li>
                      ))}
                    </ul>
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
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Mark Uninformed Leaves</h1>
        {renderMarkUninformedContent()}
      </div>
    );
  }

  // Default: "My Leaves" – self-service employee view (for employees, managers, admins)
  return (
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
  );
}












