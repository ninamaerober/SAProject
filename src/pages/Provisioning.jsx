import { useEffect, useState } from 'react';
import { supabase, rpc } from '../supabase.js';
import { useAsync, fmtDateTime } from '../lib.js';
import { Badge, Card, PageHeader, StatusBadge, Loading, Empty, ErrorBox, Script, useAction } from '../components/ui.jsx';

export default function Provisioning() {
  const { run, busy } = useAction();
  const [sel, setSel] = useState(null);
  const [script, setScript] = useState('');

  const q = useAsync(() => supabase.from('access_requests')
    .select('*, employee:employees(full_name,email,job_title,employee_no), department:departments(name), group:access_groups(name,is_admin)')
    .eq('type', 'onboarding').in('status', ['approved', 'account_created', 'completed'])
    .order('created_at', { ascending: false }));

  const approved = (q.data || []).filter((r) => r.status === 'approved');
  const done = (q.data || []).filter((r) => r.status !== 'approved');

  useEffect(() => {
    setScript('');
    if (!sel) return;
    rpc('build_ad_script', { p_request: sel.id, p_part: 'account' }).then(setScript).catch((e) => setScript('# ' + e.message));
  }, [sel?.id]);

  const execute = () => run(async () => {
    await rpc('provision_account', { p_request: sel.id });
    setSel(null);
    q.reload();
  }, 'AD DS account created');

  return (
    <>
      <PageHeader eyebrow="Feature 04 · IT administrator" title="AD DS integration">
        Check the script preview and run it. No account exists before this step.
      </PageHeader>
      <ErrorBox error={q.error} />
      <div className="grid two">
        <Card title={`Approved requests (${approved.length})`}>
          {q.loading ? <Loading /> : approved.length === 0 ? <Empty>No approved requests waiting.</Empty> : (
            <div className="list">{approved.map((r) => (
              <button key={r.id} className={`list-item ${sel?.id === r.id ? 'selected' : ''}`} onClick={() => setSel(r)}>
                <div><strong>{r.employee.full_name}</strong>
                  <div className="muted small">{r.employee.job_title} → {r.department?.name} / {r.group?.name}</div>
                  <div className="muted small">Approved by {r.decided_by_name}, {fmtDateTime(r.decided_at)}</div></div>
                <Badge tone="good">Manager approved</Badge>
              </button>))}
            </div>
          )}
        </Card>
        <Card title="PowerShell preview">
          {!sel ? <Empty>Select a request to preview its script.</Empty> : (
            <>
              <ul className="checks">
                <li className="ok">AI recommendation recorded (recommendation only)</li>
                <li className="ok">Manager approval: {sel.decided_by_name}</li>
                <li className={sel.group?.is_admin ? 'no' : 'ok'}>{sel.group?.is_admin ? 'Administrative group blocked' : 'No administrative privileges requested'}</li>
              </ul>
              <Script code={script} />
              <div className="actions">
                <button className="btn" disabled={busy || !script} onClick={execute}>Run script and create account</button>
              </div>
            </>
          )}
        </Card>
      </div>
      <Card title="Already provisioned" className="mt">
        {done.length === 0 ? <Empty>Nothing yet.</Empty> : (
          <table className="table"><thead><tr><th>Employee</th><th>Group</th><th>Run</th><th>Status</th></tr></thead>
            <tbody>{done.map((r) => (
              <tr key={r.id}><td>{r.employee.full_name}</td><td><code>{r.group?.name}</code></td><td>{fmtDateTime(r.executed_at)}</td><td><StatusBadge status={r.status} /></td></tr>
            ))}</tbody></table>
        )}
      </Card>
    </>
  );
}
