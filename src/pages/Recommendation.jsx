import { useState } from 'react';
import { supabase, rpc } from '../supabase.js';
import { useAsync } from '../lib.js';
import { Badge, Card, PageHeader, StatusBadge, Loading, Empty, ErrorBox, useAction } from '../components/ui.jsx';

export default function Recommendation() {
  const { run, busy } = useAction();
  const [sel, setSel] = useState(null);
  const [rec, setRec] = useState(null);
  const [note, setNote] = useState(null);

  const emps = useAsync(() => supabase.from('employees')
    .select('*, department:departments(name), manager:profiles(full_name)')
    .in('status', ['registered', 'recommended', 'returned'])
    .order('created_at', { ascending: false }));

  async function load(emp) {
    setSel(emp); setRec(null); setNote(null);
    const { data } = await supabase.from('recommendations')
      .select('*, department:departments(name), group:access_groups(name,folder_path)')
      .eq('employee_id', emp.id).order('created_at', { ascending: false }).limit(1);
    setRec(data?.[0] || null);
    if (emp.status === 'returned') {
      const { data: r } = await supabase.from('access_requests').select('manager_note')
        .eq('employee_id', emp.id).eq('status', 'returned').order('created_at', { ascending: false }).limit(1);
      setNote(r?.[0]?.manager_note || null);
    }
  }

  const generate = () => run(async () => {
    await rpc('recommend_access', { p_employee: sel.id });
    emps.reload();
    await load({ ...sel, status: 'recommended' });
  }, 'Recommendation generated');

  const submit = () => run(async () => {
    await rpc('submit_request', { p_employee: sel.id });
    setSel(null); setRec(null);
    emps.reload();
  }, 'Sent to the manager for approval');

  return (
    <>
      <PageHeader eyebrow="Feature 02 · HR staff" title="AI role recommendation">
        Shows the suggested department, access group and folder with the reasons. It is a recommendation only.
      </PageHeader>
      <div className="grid two">
        <Card title="Employees waiting">
          <ErrorBox error={emps.error} />
          {emps.loading ? <Loading /> : (emps.data || []).length === 0 ? <Empty>Nobody is waiting. Register an employee first.</Empty> : (
            <div className="list">
              {emps.data.map((e) => (
                <button key={e.id} className={`list-item ${sel?.id === e.id ? 'selected' : ''}`} onClick={() => load(e)}>
                  <div><strong>{e.full_name}</strong><div className="muted small">{e.job_title} · manager {e.manager?.full_name || 'none'}</div></div>
                  <StatusBadge status={e.status} />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title={sel ? sel.full_name : 'Recommendation'}>
          {!sel ? <Empty>Select an employee on the left.</Empty> : (
            <>
              {note && <div className="alert human"><b>Returned by manager:</b> {note}</div>}
              {!rec ? (
                <Empty>No recommendation yet for this employee.</Empty>
              ) : (
                <div className="rec">
                  <div className="rec-top">
                    <Badge tone="info">Recommendation only</Badge>
                    <span className="muted small">Confidence {rec.confidence}%</span>
                  </div>
                  <dl className="kv">
                    <dt>Department</dt><dd>{rec.department?.name || '—'}</dd>
                    <dt>Access group</dt><dd><code>{rec.group?.name}</code></dd>
                    <dt>Shared folder</dt><dd><code>{rec.folder_path || '—'}</code></dd>
                  </dl>
                  <h4>Why</h4>
                  <ul>{rec.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              )}
              <div className="actions">
                <button className="btn secondary" disabled={busy} onClick={generate}>{rec ? 'Regenerate' : 'Generate AI recommendation'}</button>
                <button className="btn" disabled={busy || !rec || sel.status !== 'recommended'} onClick={submit}>Submit for manager approval</button>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
