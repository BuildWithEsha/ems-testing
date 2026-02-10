import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const IdleAccountabilityAdmin = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    status: '',
    department: '',
    category: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [ticketDate, setTicketDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [templateTitle, setTemplateTitle] = useState('EMS idle time – reason not submitted');
  const [templateDescription, setTemplateDescription] = useState(
    'This notification is to inform you that you had high idle time and did not submit an accountability reason for the selected date.'
  );
  const [creatingTickets, setCreatingTickets] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.status) params.set('status', filters.status);
      if (filters.department) params.set('department', filters.department);
      if (filters.category) params.set('category', filters.category);

      const headers = {
        'x-user-role': user.role || 'employee',
        'x-user-permissions': JSON.stringify(user.permissions || [])
      };

      const res = await fetch(`/api/admin/idle-accountability?${params.toString()}`, {
        headers
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load idle accountability records');
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error loading idle accountability admin list:', e);
      setError(e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueDepartments = Array.from(
    new Set(items.map((i) => i.department || 'Unassigned'))
  ).sort();
  const uniqueCategories = Array.from(
    new Set(items.map((i) => i.category || ''))
  )
    .filter(Boolean)
    .sort();

  const canCreateIdleTickets = !!user && (
    (user.role && (user.role === 'admin' || user.role === 'Admin')) ||
    user.permissions?.includes('all') ||
    user.permissions?.includes('tickets_auto_less_hours')
  );

  const handleOpenCreateTickets = () => {
    if (!canCreateIdleTickets) return;
    // Default ticket date to either To date filter or yesterday
    const base =
      filters.to ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
      })();
    setTicketDate(base);
    setCreateModalOpen(true);
  };

  const handleCreateTickets = async () => {
    if (!canCreateIdleTickets || !ticketDate) return;
    try {
      setCreatingTickets(true);
      const body = { date: ticketDate };
      const res = await fetch('/api/tickets/auto-idle-accountability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user-role': user?.role || 'admin',
          'user-permissions': JSON.stringify(user?.permissions || ['all']),
          'user-id': String(user?.id || '')
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to auto-create idle tickets');
      }
      const result = await res.json();
      alert(
        `Created ${result.ticketsCreated || 0} "Idle Time" ticket(s) for ${result.date}.`
      );
      setCreateModalOpen(false);
      load();
    } catch (e) {
      console.error('Error auto-creating idle tickets:', e);
      alert(e.message || 'Failed to auto-create idle tickets');
    } finally {
      setCreatingTickets(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Idle Accountability (Admin)</h1>
        <button
          onClick={load}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From date</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To date</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="ticket_created">Ticket created</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
          <select
            value={filters.department}
            onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {uniqueDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <select
            value={filters.category}
            onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {uniqueCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <button
          onClick={load}
          className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 mr-2"
        >
          Apply filters
        </button>
        {canCreateIdleTickets && (
          <button
            onClick={handleOpenCreateTickets}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700"
          >
            Create idle tickets
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading records...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          No idle accountability records found for the selected filters.
        </div>
      ) : (
        <div className="overflow-auto border border-gray-200 rounded-lg bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Idle (min)
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subcategory
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticket
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">{item.date}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                    {item.employee_name || item.employee_email || 'Unknown'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                    {item.department || 'Unassigned'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                    {item.idle_minutes}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.status === 'pending'
                          ? 'bg-yellow-50 text-yellow-800'
                          : item.status === 'submitted'
                          ? 'bg-green-50 text-green-800'
                          : item.status === 'ticket_created'
                          ? 'bg-red-50 text-red-800'
                          : 'bg-gray-50 text-gray-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                    {item.category || '-'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                    {item.subcategory || '-'}
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-xs">
                    <div className="truncate" title={item.reason_text || ''}>
                      {item.reason_text || '-'}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                    {item.ticket_id ? `Ticket #${item.ticket_id}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Create idle tickets
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              This will create high-priority <span className="font-semibold">Idle Time</span>{' '}
              tickets for all employees who have pending idle accountability for the selected date
              and have not submitted a reason.
            </p>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Date to check for pending accountability
                </label>
                <input
                  type="date"
                  value={ticketDate}
                  onChange={(e) => setTicketDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Ticket title (template)
                </label>
                <input
                  type="text"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                  disabled
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Ticket description (template)
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                  disabled
                />
                <p className="mt-1 text-xs text-gray-400">
                  The ticket body currently uses a fixed template on the server with date, employee,
                  department and idle minutes. This text is a preview only.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={creatingTickets}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTickets}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                disabled={creatingTickets || !ticketDate}
              >
                {creatingTickets ? 'Creating...' : 'Create tickets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdleAccountabilityAdmin;

