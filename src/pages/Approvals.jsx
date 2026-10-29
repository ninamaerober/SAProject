import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { supabase, rpc } from '../supabase.js';
import { useAsync, fmtDateTime } from '../lib.js';
import { Badge, Card, PageHeader, StatusBadge, Loading, Empty, ErrorBox, useAction } from '../components/ui.jsx';

function RequestCard({ r, onDone }) {
  const { run, busy } = useAction();
  const [note, setNote] = useState('');
  const decide = (decision, msg) => run(async () => {
    await rpc('decide_request', { p_request: r.id, p_decision: decision, p_note: note || null });
    onDone();
  }, msg);
  return (
    <div className="req">
      <div className="req-head">
        <div><strong>{r.employee.full_name}</strong> <span className="muted">· {r.employee.job_title}</span>
          <div className="muted small">{r.employee.employee_no} · requested by {r.requested_by_name} · {fmtDateTime(r.created_at)}</div></div>
        <Badge tone="human">Human decision</Badge>
      </div>
      <dl className="kv">
        <dt>Department</dt><dd>{r.department?.name}</dd>
        <dt>Access group</dt><dd><code>{r.group?.name}</code></dd>
        <dt>Shared folder</dt><dd><code>{r.folder_path || '—'}</code></dd>
        <dt>AI confidence</dt><dd>{r.recommendation?.confidence}% <span className="muted small">(recommendation only)</span></dd>
      </dl>
      <ul className="reasons">{(r.recommendation?.reasons || []).map((x) => <li key={x}>{x}</li>)}</ul>
      <label>Note (required to return or reject)
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for your decision" />
      </label>
      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => decide('approved', 'Request approved')}>Approve</button>
        <button className="btn secondary" disabled={busy} onClick={() => decide('returned', 'Returned to HR')}>Return</button>
        <button className="btn danger" disabled={busy} onClick={() => decide('rejected', 'Request rejected')}>Reject</button>
      </div>
    </div>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const q = useAsync(() => supabase.from('access_requests')
    .select('*, employee:employees!inner(full_name,job_title,employee_no,manager_id), department:departments(name), group:access_groups(name), recommendation:recommendations(confidence,reasons)')
    .eq('type', 'onboarding').eq('employee.manager_id', user.id)
    .order('created_at', { ascending: false }), [user.id]);

  const all = q.data || [];
  const pending = all.filter((r) => r.status === 'pending_manager');
  const history = all.filter((r) => r.status !== 'pending_manager');

  return (
    <>
      <PageHeader eyebrow="Feature 03 · Manager" title="Approval workflow">
        Review each request and approve, return or reject it. Nothing is created until you and IT have both decided.
      </PageHeader>
      <ErrorBox error={q.error} />
      {q.loading ? <Loading /> : (
        <>
          <h3 className="section">Waiting for you ({pending.length})</h3>
          {pending.length === 0 ? <Empty>No requests waiting.</Empty> : (
            <div className="stack">{pending.map((r) => <RequestCard key={r.id} r={r} onDone={q.reload} />)}</div>
          )}
          <Card title="Decision history" className="mt">
            {history.length === 0 ? <Empty>No decisions yet.</Empty> : (
              <table className="table">
                <thead><tr><th>Employee</th><th>Group</th><th>Decision</th><th>Note</th><th>When</th></tr></thead>
                <tbody>{history.map((r) => (
                  <tr key={r.id}><td>{r.employee.full_name}</td><td><code>{r.group?.name}</code></td>
                    <td><StatusBadge status={r.status} /></td><td>{r.manager_note || '—'}</td><td>{fmtDateTime(r.decided_at)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
