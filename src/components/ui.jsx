import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((type, text) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, type, text }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 4500);
  }, []);
  const api = { ok: (t) => push('ok', t), err: (t) => push('err', t) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts">
        {items.map((i) => <div key={i.id} className={`toast ${i.type}`}>{i.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// run(asyncFn, successMessage) -> handles busy flag + toasts
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast.ok(okMsg);
      return r;
    } catch (e) {
      toast.err(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

const STATUS = {
  registered: ['Registered', 'neutral'],
  recommended: ['AI recommended', 'info'],
  pending_approval: ['Awaiting manager', 'human'],
  pending_manager: ['Awaiting manager', 'human'],
  approved: ['Approved', 'good'],
  returned: ['Returned', 'human'],
  rejected: ['Rejected', 'bad'],
  account_created: ['Account created', 'info'],
  active: ['Active', 'good'],
  offboarding: ['Offboarding', 'human'],
  pending_it: ['Awaiting IT', 'human'],
  offboarded: ['Offboarded', 'neutral'],
  completed: ['Completed', 'good'],
};
export function StatusBadge({ status }) {
  const [label, tone] = STATUS[status] || [status, 'neutral'];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export const Badge = ({ tone = 'neutral', children }) => <span className={`badge ${tone}`}>{children}</span>;

export function PageHeader({ eyebrow, title, children }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
    </div>
  );
}

export const Card = ({ title, right, children, className = '' }) => (
  <section className={`card ${className}`}>
    {(title || right) && <div className="card-head"><h3>{title}</h3>{right}</div>}
    {children}
  </section>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty">Loading…</div>;
export const ErrorBox = ({ error }) => (error ? <div className="alert bad">{error}</div> : null);

export const Script = ({ code }) => <pre className="script">{code || '…'}</pre>;
