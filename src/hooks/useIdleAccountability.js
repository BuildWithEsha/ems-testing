import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useIdleAccountability = () => {
  const { user } = useAuth();
  const [pendingItems, setPendingItems] = useState([]);
  const [resolvedItems, setResolvedItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ from: '', to: '' });

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/idle-accountability/categories');
      if (!res.ok) return;
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      // ignore
    }
  };

  const fetchMyItems = async (overrideFilters) => {
    if (!user?.id && !user?.email) {
      setPendingItems([]);
      setResolvedItems([]);
      return;
    }
    const effectiveFilters = overrideFilters || filters;
    try {
      setLoading(true);
      setError(null);
      const headers = {};
      if (user?.id) headers['x-user-id'] = String(user.id);
      if (user?.email) headers['x-user-email'] = user.email;
      const params = new URLSearchParams();
      if (effectiveFilters.from) params.set('from', effectiveFilters.from);
      if (effectiveFilters.to) params.set('to', effectiveFilters.to);
      const res = await fetch(
        `/api/idle-accountability/my?${params.toString()}`,
        { headers }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load idle accountability items');
      }
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      const pending = rows.filter(
        (i) => Number(i.idle_minutes) > 20 && i.status === 'pending'
      );
      // An accountability item is only considered "resolved" once
      // the employee has submitted a form (or it has been waived).
      const resolved = rows.filter(
        (i) => i.status === 'submitted' || i.status === 'waived'
      );
      setPendingItems(pending);
      setResolvedItems(resolved);
    } catch (e) {
      console.error('Error fetching idle accountability items:', e);
      setError(e.message);
      setPendingItems([]);
      setResolvedItems([]);
    } finally {
      setLoading(false);
    }
  };

  const submitReason = async (id, payload) => {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (user?.id) headers['x-user-id'] = String(user.id);
    if (user?.email) headers['x-user-email'] = user.email;

    const res = await fetch(`/api/idle-accountability/${id}/reason`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to submit reason');
    }
    await fetchMyItems();
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    fetchMyItems();
  }, [user?.id, user?.email]);

  return {
    pendingItems,
    resolvedItems,
    categories,
    loading,
    error,
    filters,
    setFilters,
    refresh: fetchMyItems,
    submitReason
  };
};

