import React, { useState } from 'react';
import { useIdleAccountability } from '../../hooks/useIdleAccountability';

const IdleReasonForms = () => {
  const { items, categories, loading, error, submitReason, refresh } = useIdleAccountability();
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ category: '', subcategory: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Idle Time Accountability</h1>
        <button
          onClick={refresh}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading pending items...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          You have no pending idle accountability items.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="border border-gray-200 rounded-lg p-4 flex items-start justify-between bg-white shadow-sm"
            >
              <div>
                <div className="text-sm text-gray-500 mb-1">
                  Date: <span className="font-medium text-gray-900">{item.date}</span>
                </div>
                <div className="text-sm text-gray-500 mb-1">
                  Idle time: <span className="font-medium text-gray-900">{item.idle_minutes} minutes</span> (threshold {item.threshold_minutes}m)
                </div>
                <div className="text-sm text-gray-500">
                  Status:{' '}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-800">
                    {item.status}
                  </span>
                </div>
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

