import { useEffect, useState } from 'react';

// Runs a supabase query, returns {data, loading, error, reload}
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(fn())
      .then((r) => {
        if (!alive) return;
        if (r && r.error) setState({ data: null, loading: false, error: r.error.message });
        else setState({ data: r ? r.data : null, loading: false, error: null });
      })
      .catch((e) => alive && setState({ data: null, loading: false, error: e.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const ROLE_LABEL = { hr: 'HR staff', manager: 'Manager', it_admin: 'IT administrator' };
