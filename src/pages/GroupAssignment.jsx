import { useEffect, useState } from 'react';
import { supabase, rpc } from '../supabase.js';
import { useAsync } from '../lib.js';
import { Badge, Card, PageHeader, Loading, Empty, ErrorBox, Script, useAction } from '../components/ui.jsx';

export default function GroupAssignment() {
  const { run, busy } = useAction();
  const [sel, setSel] = useState(null);
  const [script, setScript] = useState('');

  const q = useAsync(() => supabase.from('access_requests')
    .select('*, employee:employees(full_name,job_title,employee_no), group:access_groups(name,folder_path)')
    .eq('type', 'onboarding').eq('status', 'account_created').order('created_at'));
  const groups = useAsync(() => supabase.from('access_groups').select('*').order('name'));

  useEffect(() => {
    setScript('');
    if (!sel) return;
    rpc('build_ad_script', { p_request: sel.id, p_part: 'groups' }).then(setScript).catch((e) => setScript('# ' + e.message));
  }, [sel?.id]);

  const assign = () => run(async () => {
    await rpc('assign_groups', { p_request: sel.id });
    setSel(null);
    q.reload();
  }, 'Group assigned and folder access granted');

  return (
    <>
      <PageHeader eyebrow="Feature 05 · IT administrator" title="Group assignment">
        Approved groups are added to the account. Administrative groups stay locked.
      </PageHeader>
      <ErrorBox error={q.error} />
      <div className="grid two">
        <Card title={`Accounts waiting for a group (${(q.data || []).length})`}>
          {q.loading ? <Loading /> : (q.data || []).length === 0 ? <Empty>No accounts are waiting for group assignment.</Empty> : (
            <div className="list">{q.data.map((r) => (
              <button key={r.id} className={`list-item ${sel?.id === r.id ? 'selected' : ''}`} onClick={() => setSel(r)}>
                <div><strong>{r.employee.full_name}</strong>
                  <div className="muted small">Add to <code>{r.group?.name}</code> · {r.group?.folder_path}</div></div>
                <Badge tone="info">Account created</Badge>
              </button>))}
            </div>
          )}
          {sel && (
            <>
              <Script code={script} />
              <div className="actions"><button className="btn" disabled={busy || !script} onClick={assign}>Assign group</button></div>
            </>
          )}
        </Card>
        <Card title="Groups">
          {groups.loading ? <Loading /> : (
            <table className="table"><thead><tr><th>Group</th><th>Folder</th><th></th></tr></thead>
              <tbody>{(groups.data || []).map((g) => (
                <tr key={g.id}><td><code>{g.name}</code><div className="muted small">{g.description}</div></td>
                  <td>{g.folder_path || '—'}</td>
                  <td>{g.is_admin ? <Badge tone="bad">🔒 Locked</Badge> : <Badge tone="good">Assignable</Badge>}</td></tr>
              ))}</tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}
