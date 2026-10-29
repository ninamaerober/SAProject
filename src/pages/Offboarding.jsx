import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { supabase, rpc } from '../supabase.js';
import { useAsync, fmtDate, fmtDateTime } from '../lib.js';
import { Badge, Card, PageHeader, StatusBadge, Loading, Empty, ErrorBox, Script, useAction } from '../components/ui.jsx';

function HrPanel({ onChange }) {
  const { run, busy } = useAction();
  const [f, setF] = useState({ employee: '', reason: '', last_day: '' });
  const emps = useAsync(() => supabase.from('employees').select('id,full_name,job_title,employee_no').eq('status', 'active').order('full_name'));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await rpc('start_offboarding', { p_employee: f.employee, p_reason: f.reason, p_last_day: f.last_day });
      setF({ employee: '', reason: '', last_day: '' });
      emps.reload(); onChange();
    }, 'Account-disable request sent to IT');
  };
  return (
    <Card title="Record a departure">
      <form className="form" onSubmit={submit}>
        <label>Employee
          <select required value={f.employee} onChange={set('employee')}>
            <option value="">Select active employee</option>
            {(emps.data || []).map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.job_title}</option>)}
          </select>
        </label>
        <div className="row">
          <label>Last working day<input type="date" required value={f.last_day} onChange={set('last_day')} /></label>
          <label>Reason<input required value={f.reason} onChange={set('reason')} placeholder="Resignation, end of contract…" /></label>
        </div>
        <button className="btn" disabled={busy}>Generate account-disable request</button>
      </form>
    </Card>
  );
}

function ItPanel({ pending, onChange }) {
  const { run, busy } = useAction();
  const [sel, setSel] = useState(null);
  const [script, setScript] = useState('');
  useEffect(() => {
    setScript('');
    if (!sel) return;
    rpc('build_ad_script', { p_request: sel.id, p_part: 'disable' }).then(setScript).catch((e) => setScript('# ' + e.message));
  }, [sel?.id]);
  const decide = (approve) => run(async () => {
    await rpc('decide_offboarding', { p_request: sel.id, p_approve: approve });
    setSel(null); onChange();
  }, approve ? 'Account disabled and access revoked' : 'Request rejected');
  return (
    <Card title={`Disable requests to approve (${pending.length})`}>
      {pending.length === 0 ? <Empty>No pending requests.</Empty> : (
        <div className="list">{pending.map((r) => (
          <button key={r.id} className={`list-item ${sel?.id === r.id ? 'selected' : ''}`} onClick={() => setSel(r)}>
            <div><strong>{r.employee.full_name}</strong>
              <div className="muted small">{r.reason} · last day {fmtDate(r.last_day)}</div></div>
            <Badge tone="human">Human decision</Badge>
          </button>))}
        </div>
      )}
      {sel && (<>
        <Script code={script} />
        <div className="actions">
          <button className="btn danger" disabled={busy || !script} onClick={() => decide(true)}>Approve and disable account</button>
          <button className="btn secondary" disabled={busy} onClick={() => decide(false)}>Reject</button>
        </div></>)}
    </Card>
  );
}

export default function Offboarding() {
  const { profile } = useAuth();
  const q = useAsync(() => supabase.from('access_requests')
    .select('*, employee:employees(full_name,job_title,employee_no)')
    .eq('type', 'offboarding').order('created_at', { ascending: false }));
  const all = q.data || [];
  const pending = all.filter((r) => r.status === 'pending_it');

  return (
    <>
      <PageHeader eyebrow="Feature 07 · HR staff and IT administrator" title="Offboarding">
        HR records the departure and generates an account-disable request for IT to approve.
      </PageHeader>
      <ErrorBox error={q.error} />
      <div className="grid two">
        {profile.role === 'hr' ? <HrPanel onChange={q.reload} /> : <ItPanel pending={pending} onChange={q.reload} />}
        <Card title="Offboarding requests">
          {q.loading ? <Loading /> : all.length === 0 ? <Empty>No requests yet.</Empty> : (
            <table className="table"><thead><tr><th>Employee</th><th>Last day</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>{all.map((r) => (
                <tr key={r.id}><td>{r.employee.full_name}<div className="muted small">{r.reason}</div></td>
                  <td>{fmtDate(r.last_day)}</td><td><StatusBadge status={r.status} /></td>
                  <td>{fmtDateTime(r.executed_at || r.decided_at || r.created_at)}</td></tr>
              ))}</tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}
