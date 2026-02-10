import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useIdleAccountabilitySummary = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const todayYmd = () => new Date().toISOString().split('T')[0];

  const fetchSummary = async () => {
    if (!user?.id && !user?.email) {
      setItems([]);
      setPendingCount(0);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const headers = {};
      if (user?.id) headers['x-user-id'] = String(user.id);
      if (user?.email) headers['x-user-email'] = user.email;

      const to = todayYmd();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 14);
      const from = fromDate.toISOString().split('T')[0];

      const res = await fetch(
        `/api/idle-accountability/my-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load idle accountability summary');
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);

      // Pending count
      try {
        const countRes = await fetch('/api/idle-accountability/my-pending-count', { headers });
        if (countRes.ok) {
          const countData = await countRes.json();
          setPendingCount(Number(countData.count || 0));
        } else {
          setPendingCount(0);
        }
      } catch {
        setPendingCount(0);
      }
    } catch (e) {
      console.error('Error fetching idle accountability summary hook:', e);
      setError(e.message);
      setItems([]);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [user?.id, user?.email]);

  return {
    items,
    pendingCount,
    loading,
    error,
    refresh: fetchSummary
  };
};

