import React, { useState } from 'react';
import { useIdleAccountability } from '../../hooks/useIdleAccountability';

const IdleReasonForms = () => {
  const {
    pendingItems,
    resolvedItems,
    categories,
    loading,
    error,
    submitReason,
    refresh,
    filters,
    setFilters
  } = useIdleAccountability();
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ category: '', subcategory: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');

  const handleOpen = (item) => {
    setSelectedId(item.id);
    setForm({
      category: item.category || '',
      subcategory: item.subcategory || '',
      reason: item.reason_text || ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId || !form.category || !form.subcategory || !form.reason.trim()) return;
    try {
      setSubmitting(true);
      await submitReason(selectedId, form);
      setSelectedId(null);
      setForm({ category: '', subcategory: '', reason: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const availableCategories = categories || [];
  const selectedCategory = availableCategories.find((c) => c.key === form.category) || null;
  const subcategories = selectedCategory?.subcategories || [];

  const handleApplyFilters = () => {
    refresh(filters);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Idle Time Accountability</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => refresh()}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From date</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                from: e.target.value
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To date</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                to: e.target.value
              }))
            }
            className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex space-x-4 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'pending'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pending Accountability
            <span className="ml-1 text-xs text-gray-400">
              ({pendingItems.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${
              activeTab === 'resolved'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Resolved Accountability
            <span className="ml-1 text-xs text-gray-400">
              ({resolvedItems.length})
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={handleApplyFilters}
          className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Apply filters
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading items...</div>
      ) : activeTab === 'pending' ? (
        pendingItems.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            You have no pending idle accountability items for the selected dates (over 20 minutes).
          </div>
        ) : (
          <div className="space-y-4">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 rounded-lg p-4 flex items-start justify-between bg-white shadow-sm"
              >
                <div>
                  <div className="text-sm text-gray-500 mb-1">
                    Date: <span className="font-medium text-gray-900">{item.date}</span>
                  </div>
                  <div className="text-sm text-gray-500 mb-1">
                    Idle time:{' '}
                    <span className="font-medium text-gray-900">
                      {item.idle_minutes} minutes
                    </span>{' '}
                    (threshold {item.threshold_minutes}m)
                  </div>
                  <div className="text-sm text-gray-500">
                    Status:{' '}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-800">
                      {item.status}
                    </span>
                  </div>
                  {item.ticket_id && (
                    <div className="mt-1 text-xs text-gray-500">
                      Ticket already created for this day (Ticket #{item.ticket_id})
                    </div>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => handleOpen(item)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    {item.category ? 'Edit reason' : 'Submit reason'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : resolvedItems.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          You have no resolved idle accountability items for the selected dates.
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
              {resolvedItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">{item.date}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                    {item.idle_minutes}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.status === 'submitted'
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
                    {item.ticket_id ? `Ticket #${item.ticket_id}` : 'No ticket'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit idle reason</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, category: e.target.value, subcategory: '' }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select category...</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subcategory</label>
                <select
                  value={form.subcategory}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, subcategory: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={!form.category}
                >
                  <option value="">Select subcategory...</option>
                  {subcategories.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional details</label>
                <textarea
                  value={form.reason}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Explain why you had higher idle time on this day..."
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setForm({ category: '', subcategory: '', reason: '' });
                  }}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdleReasonForms;

