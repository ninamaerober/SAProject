import { useState } from 'react';
import { supabase } from '../supabase.js';
import { useAsync } from '../lib.js';
import { Card, PageHeader, Loading, Empty, ErrorBox, useAction } from '../components/ui.jsx';

export default function Rules() {
  const { run, busy } = useAction();
  const [f, setF] = useState({ keyword: '', group_id: '', weight: 3, reason: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rules = useAsync(() => supabase.from('role_rules').select('*, group:access_groups(name,is_admin)').order('keyword'));
  const groups = useAsync(() => supabase.from('access_groups').select('id,name').eq('is_admin', false).order('name'));

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const { error } = await supabase.from('role_rules').insert({ ...f, keyword: f.keyword.trim().toLowerCase(), weight: Number(f.weight) });
      if (error) throw new Error(error.message);
      setF({ keyword: '', group_id: '', weight: 3, reason: '' });
      rules.reload();
    }, 'Rule added');
  };
  const del = (id) => run(async () => {
    const { error } = await supabase.from('role_rules').delete().eq('id', id);
    if (error) throw new Error(error.message);
    rules.reload();
  }, 'Rule removed');

  return (
    <>
      <PageHeader eyebrow="IT administrator" title="Recommendation rules">
        Job-title keywords the AI recommendation scores. Administrative groups can never be recommended, even if a rule points to one.
      </PageHeader>
      <div className="grid two wide-left">
        <Card title="Add rule">
          <form className="form" onSubmit={add}>
            <label>Job-title keyword<input required value={f.keyword} onChange={set('keyword')} placeholder="designer" /></label>
            <label>Recommend group
              <select required value={f.group_id} onChange={set('group_id')}>
                <option value="">Select group</option>
                {(groups.data || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label>Weight (1–10)<input type="number" min="1" max="10" value={f.weight} onChange={set('weight')} /></label>
            <label>Reason shown to HR<input required value={f.reason} onChange={set('reason')} placeholder="Designers use the Engineering share" /></label>
            <button className="btn" disabled={busy}>Add rule</button>
          </form>
        </Card>
        <Card title="Rules">
          <ErrorBox error={rules.error} />
          {rules.loading ? <Loading /> : (rules.data || []).length === 0 ? <Empty>No rules.</Empty> : (
            <div className="scroll tall"><table className="table">
              <thead><tr><th>Keyword</th><th>Group</th><th>Wt</th><th>Reason</th><th></th></tr></thead>
              <tbody>{rules.data.map((r) => (
                <tr key={r.id}><td><code>{r.keyword}</code></td>
                  <td><code>{r.group?.name}</code>{r.group?.is_admin && ' 🔒'}</td><td>{r.weight}</td>
                  <td className="small">{r.reason}</td>
                  <td><button className="btn small ghost" disabled={busy} onClick={() => del(r.id)}>Delete</button></td></tr>
              ))}</tbody></table></div>
          )}
        </Card>
      </div>
    </>
  );
}
