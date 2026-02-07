import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PendingLeaveActionsModal() {
  const { user } = useAuth();
  const [pending, setPending] = useState({ swapRequests: [], acknowledgeRequests: [] });
  const [modal, setModal] = useState(null);
  const employeeId = user?.id;
  const isAdmin = user?.role === 'admin' || user?.role === 'Admin';

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    const fetchPending = async () => {
      try {
        const res = await fetch(`/api/leaves/pending-actions?employee_id=${employeeId}`, {
          headers: {
            'x-user-role': user?.role || 'employee',
            'x-user-id': String(user?.id || ''),
          },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const swap = (data.swapRequests || [])[0];
        const ack = (data.acknowledgeRequests || [])[0];
        setPending({
          swapRequests: data.swapRequests || [],
          acknowledgeRequests: data.acknowledgeRequests || [],
        });
        if (isAdmin && ack) setModal({ type: 'ack', data: ack });
        else if (swap) setModal({ type: 'swap', data: swap });
        else if (ack) setModal({ type: 'ack', data: ack });
        else setModal(null);
      } catch {
        // ignore
      }
    };
    fetchPending();
    return () => { cancelled = true; };
  }, [employeeId, user?.role, user?.id]);

  const refetchAndClose = async () => {
    setModal(null);
    if (!employeeId) return;
    try {
      const res = await fetch(`/api/leaves/pending-actions?employee_id=${employeeId}`, {
        headers: { 'x-user-role': user?.role || 'employee', 'x-user-id': String(user?.id || '') },
      });
      if (!res.ok) return;
      const data = await res.json();
      const swap = (data.swapRequests || [])[0];
      const ack = (data.acknowledgeRequests || [])[0];
      setPending({ swapRequests: data.swapRequests || [], acknowledgeRequests: data.acknowledgeRequests || [] });
      if (isAdmin && ack) setModal({ type: 'ack', data: ack });
      else if (swap) setModal({ type: 'swap', data: swap });
      else if (ack) setModal({ type: 'ack', data: ack });
    } catch {
      // ignore
    }
  };

  const handleRespondSwap = async (requestingLeaveId, accept) => {
    try {
      const res = await fetch(`/api/leaves/${requestingLeaveId}/respond-swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user?.id || ''), 'x-user-role': user?.role || 'employee' },
        body: JSON.stringify({ accept, employee_id: employeeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to respond');
        return;
      }
      await refetchAndClose();
      if (accept) alert('You accepted. Please go to Leaves → Future leaves and edit your leave dates so the requested period becomes available.');
    } catch (err) {
      alert('Failed to respond');
    }
  };

  const handleAcknowledge = async (leaveId, approved, leaveType) => {
    try {
      const res = await fetch(`/api/leaves/${leaveId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': user?.role || 'employee', 'x-user-id': String(user?.id || '') },
        body: JSON.stringify({ approved, leave_type: leaveType || 'paid', decision_by: user?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to acknowledge');
        return;
      }
      await refetchAndClose();
      alert(approved ? 'Leave acknowledged and approved.' : 'Leave has been rejected.');
    } catch (err) {
      alert('Failed to acknowledge');
    }
  };

  if (!modal) return null;

  if (modal.type === 'swap') {
    const data = modal.data;
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" aria-modal="true" role="dialog">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200/80">
          <div className="px-6 py-5 bg-gradient-to-b from-amber-50 to-amber-50/80 border-b border-amber-100">
            <h3 className="text-xl font-semibold text-gray-900">Leave swap request</h3>
            <p className="text-sm text-amber-800/90 mt-1.5 leading-relaxed">A colleague has requested leave on dates you currently have booked.</p>
          </div>
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Your booked leave</div>
              <div className="text-sm font-medium text-gray-900">
                {formatDate(data.my_start_date)}
                {data.my_end_date && String(data.my_end_date) !== String(data.my_start_date) ? ` – ${formatDate(data.my_end_date)}` : ''}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4">
              <div className="text-xs font-semibold text-amber-800/90 uppercase tracking-wider mb-1.5">Requested period</div>
              <div className="text-sm font-medium text-gray-900">
                {formatDate(data.start_date)}
                {data.end_date && String(data.end_date) !== String(data.start_date) ? ` – ${formatDate(data.end_date)}` : ''}
              </div>
              {(data.emergency_type || data.reason) && (
                <div className="mt-2 text-xs text-amber-800/90">
                  <span className="font-medium">Reason:</span> {data.emergency_type || data.reason}
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              If you accept, change your leave dates in <strong>Leaves → Future leaves</strong> so the requested period becomes available.
            </p>
          </div>
          <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-200 flex gap-3 justify-end">
            <button type="button" onClick={() => handleRespondSwap(data.requesting_leave_id, false)} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              Reject
            </button>
            <button type="button" onClick={() => handleRespondSwap(data.requesting_leave_id, true)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
              Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (modal.type === 'ack' && isAdmin) {
    const data = modal.data;
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" aria-modal="true" role="dialog">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200/80">
          <div className="px-6 py-5 bg-gradient-to-b from-amber-50 to-amber-50/80 border-b border-amber-100">
            <h3 className="text-xl font-semibold text-gray-900">Acknowledge emergency leave</h3>
            <p className="text-sm text-amber-800/90 mt-1.5 leading-relaxed">An employee has requested leave on a booked or important date.</p>
          </div>
          <div className="px-6 py-5 space-y-0 text-sm">
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="font-medium text-gray-500">Employee</span>
              <span className="text-gray-900">{data.employee_name || '—'}</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="font-medium text-gray-500">Date(s)</span>
              <span className="text-gray-900">
                {formatDate(data.start_date)}
                {data.end_date && String(data.end_date) !== String(data.start_date) ? ` – ${formatDate(data.end_date)}` : ''}
              </span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="font-medium text-gray-500">Emergency reason</span>
              <span className="text-gray-900 font-medium">{data.emergency_type || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="font-medium text-gray-500">Leave type to approve as</span>
              <select id="global-ack-leave-type" className="border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white" defaultValue="paid">
                <option value="paid">Paid</option>
                <option value="other">Regular</option>
              </select>
            </div>
          </div>
          <div className="px-6 py-4 flex gap-3 justify-end bg-gray-50/80 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                const leaveType = document.getElementById('global-ack-leave-type')?.value || 'paid';
                handleAcknowledge(data.leave_id, false, leaveType);
              }}
              className="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 bg-white hover:bg-gray-50 font-medium"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => {
                const leaveType = document.getElementById('global-ack-leave-type')?.value || 'paid';
                handleAcknowledge(data.leave_id, true, leaveType);
              }}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
