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

export default function Leaves() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(TABS.APPLY);
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
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'Admin' || user?.is_manager;

  const employeeId = user?.id;
  const departmentId = user?.department_id || null;

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

  const loadDepartmentLeaves = async () => {
    if (!departmentId || !isManagerOrAdmin) return;
    try {
      const res = await fetch(`/api/leaves/department?department_id=${departmentId}`);
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

  useEffect(() => {
    loadMyLeaves();
    loadPolicy();
    loadReport();
    loadDepartmentLeaves();
  }, [employeeId]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const computeDaysRequested = () => {
    if (!form.start_date || !form.end_date) return 0;
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(diffDays, 1);
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
        headers: { 'Content-Type': 'application/json' },
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

  const handleMarkUninformed = async (employeeIdForLeave, date) => {
    if (!isManagerOrAdmin) return;
    const reason = window.prompt(
      'Enter reason for marking uninformed leave:',
      'Uninformed leave'
    );
    if (reason === null) return;
    try {
      const res = await fetch('/api/leaves/mark-uninformed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeIdForLeave,
          date,
          reason,
          days: 1,
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
                        onClick={() => handleMarkUninformed(row.employee_id, row.start_date)}
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
          'If you take uninformed leaves, paid leaves from the next month will be deducted and no leaves this month will be paid out in money.'}
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
              Quota:{' '}
              <span className="font-semibold">
                {report.paid_quota}
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
            <div className="text-xs uppercase text-gray-500">Next Month Deduction</div>
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

  const renderContent = () => {
    switch (activeTab) {
      case TABS.APPLY:
        return renderApplyForm();
      case TABS.PENDING:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">My pending leaves</h2>
            {renderLeaveTable(myLeaves.pending || [])}
            {isManagerOrAdmin && (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mt-6">
                  Department pending leaves
                </h2>
                {renderDepartmentTable(departmentLeaves.pending || [], true)}
              </>
            )}
          </div>
        );
      case TABS.APPROVED:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">My recent approved leaves</h2>
            {renderLeaveTable(myLeaves.recent_approved || [])}
            {isManagerOrAdmin && (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mt-6">
                  Department recent approved leaves
                </h2>
                {renderDepartmentTable(departmentLeaves.recent_approved || [], false)}
              </>
            )}
          </div>
        );
      case TABS.REJECTED:
        return (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">My recent rejected leaves</h2>
            {renderLeaveTable(myLeaves.recent_rejected || [])}
            {isManagerOrAdmin && (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mt-6">
                  Department recent rejected leaves
                </h2>
                {renderDepartmentTable(departmentLeaves.recent_rejected || [], false)}
              </>
            )}
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Leaves</h1>
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
      {renderContent()}
    </div>
  );
}












