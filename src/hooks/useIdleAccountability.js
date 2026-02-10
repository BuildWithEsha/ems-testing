import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useIdleAccountability = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const fetchMyPending = async () => {
    if (!user?.id && !user?.email) {
      setItems([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const headers = {};
      if (user?.id) headers['x-user-id'] = String(user.id);
      if (user?.email) headers['x-user-email'] = user.email;
      const res = await fetch('/api/idle-accountability/my-pending', { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load idle accountability items');
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error fetching idle accountability items:', e);
      setError(e.message);
      setItems([]);
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
    await fetchMyPending();
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    fetchMyPending();
  }, [user?.id, user?.email]);

  return {
    items,
    categories,
    loading,
    error,
    refresh: fetchMyPending,
    submitReason
  };
};

