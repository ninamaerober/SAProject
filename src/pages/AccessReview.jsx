import { useState } from 'react';
import { supabase, rpc } from '../supabase.js';
import { useAsync, fmtDateTime } from '../lib.js';
import { Badge, Card, PageHeader, Loading, Empty, ErrorBox, useAction } from '../components/ui.jsx';

export default function AccessReview() {
  const { run, busy } = useAction();
  const [q, setQ] = useState('');
  const [showRevoked, setShowRevoked] = useState(false);
  const rows = useAsync(() => supabase.from('access_review').select('*').order('granted_at', { ascending: false }));

  const act = (id, action, msg) => run(async () => { await rpc('review_access', { p_id: id, p_action: action }); rows.reload(); }, msg);
  const list = (rows.data || [])
    .filter((r) => showRevoked || !r.revoked_at)
    .filter((r) => (r.full_name + r.sam_account_name + r.group_name).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader eyebrow="Feature 06 · IT administrator" title="Access review">
        Every permission with who approved it and when, so a reviewer can confirm it is still needed.
      </PageHeader>
      <Card title="Permissions" right={
        <div className="inline">
          <label className="check"><input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} /> Show revoked</label>
          <input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>}>
        <ErrorBox error={rows.error} />
        {rows.loading ? <Loading /> : list.length === 0 ? <Empty>No permissions to review.</Empty> : (
          <div className="scroll"><table className="table">
            <thead><tr><th>Employee</th><th>Account</th><th>Group</th><th>Approved by</th><th>Granted</th><th>Review</th><th></th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id} className={r.revoked_at ? 'dim' : ''}>
                <td><strong>{r.full_name}</strong><div className="muted small">{r.employee_no}</div></td>
                <td><code>{r.sam_account_name}</code></td>
                <td><code>{r.group_name}</code><div className="muted small">{r.folder_path}</div></td>
                <td>{r.approved_by_name || '—'}<div className="muted small">{fmtDateTime(r.approved_at)}</div></td>
                <td>{fmtDateTime(r.granted_at)}</td>
                <td>{r.revoked_at ? <Badge tone="bad">Revoked</Badge> : r.reviewed_at ? <Badge tone="good">Confirmed by {r.reviewed_by_name}</Badge> : <Badge tone="human">Needs review</Badge>}</td>
                <td className="nowrap">{!r.revoked_at && (<>
                  <button className="btn small" disabled={busy} onClick={() => act(r.id, 'keep', 'Access confirmed')}>Still needed</button>{' '}
                  <button className="btn small danger" disabled={busy} onClick={() => act(r.id, 'revoke', 'Access revoked')}>Revoke</button></>)}</td>
              </tr>))}
            </tbody></table></div>
        )}
      </Card>
    </>
  );
}
