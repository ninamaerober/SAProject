import { useState } from 'react';
import { supabase } from '../supabase.js';
import { useAsync, fmtDateTime, ROLE_LABEL } from '../lib.js';
import { Card, PageHeader, Loading, Empty, ErrorBox } from '../components/ui.jsx';

export default function AuditLog() {
  const [q, setQ] = useState('');
  const log = useAsync(() => supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300));
  const rows = (log.data || []).filter((a) => (a.action + a.actor_name + JSON.stringify(a.details)).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader eyebrow="Security" title="Audit log">Every change in AccessFlow AI is recorded here and cannot be edited from the app.</PageHeader>
      <Card title="Events" right={<input className="search" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <ErrorBox error={log.error} />
        {log.loading ? <Loading /> : rows.length === 0 ? <Empty>No events.</Empty> : (
          <div className="scroll tall"><table className="table">
            <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}><td className="nowrap">{fmtDateTime(a.created_at)}</td><td><code>{a.action}</code></td>
                <td>{a.actor_name}<div className="muted small">{ROLE_LABEL[a.actor_role] || ''}</div></td>
                <td className="small mono">{Object.entries(a.details || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td></tr>
            ))}</tbody></table></div>
        )}
      </Card>
    </>
  );
}
