import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { computeWorkloadForEmployee } from '../utils/workload';

export default function useWorkload({ employee, anchorDate }) {
  const { user } = useAuth ? useAuth() : { user: null };
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch all tasks for reports-like usage to ensure full coverage
        const params = new URLSearchParams();
        params.set('all', 'true');
        let url = `/api/tasks?${params.toString()}`;
        const headers = {};
        if (user) {
          headers['user-role'] = user.role || 'employee';
          headers['user-permissions'] = JSON.stringify((user.role === 'admin' || user.role === 'Admin') ? ['all'] : (user.permissions || []));
          headers['user-name'] = user.name || '';
        }
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error('Failed to load tasks');
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        if (isMounted) setTasks(list);
      } catch (e) {
        if (isMounted) setError(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const workload = useMemo(() => {
    if (!employee) return null;
    return computeWorkloadForEmployee(tasks, employee, anchorDate);
  }, [tasks, employee, anchorDate]);

  return { tasks, workload, loading, error };
}


