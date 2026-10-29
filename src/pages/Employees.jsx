import { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabase.js';
import { useAsync, fmtDate } from '../lib.js';
import { Card, PageHeader, StatusBadge, Loading, ErrorBox, Empty, useAction } from '../components/ui.jsx';

const blank = { full_name: '', email: '', job_title: '', department_id: '', manager_id: '', start_date: '', workstation: '' };

export default function Employees() {
  const { user } = useAuth();
  const { run, busy } = useAction();
  const [f, setF] = useState(blank);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const emps = useAsync(() => supabase.from('employees')
    .select('*, department:departments(name), manager:profiles(full_name)')
    .order('created_at', { ascending: false }));
  const depts = useAsync(() => supabase.from('departments').select('*').order('name'));
  const mgrs = useAsync(() => supabase.from('profiles').select('id,full_name').eq('role', 'manager').order('full_name'));

  async function submit(e) {
    e.preventDefault();
    await run(async () => {
      const { error } = await supabase.from('employees').insert({
        ...f, department_id: f.department_id || null, manager_id: f.manager_id || null,
        start_date: f.start_date || null, workstation: f.workstation || null, created_by: user.id,
      });
      if (error) throw new Error(error.message);
      setF(blank);
      emps.reload();
    }, 'Employee registered');
  }

  const rows = (emps.data || []).filter((e) => (e.full_name + e.email + e.job_title + e.employee_no).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader eyebrow="Feature 01 · HR staff" title="Employee registration">
        Enter the new employee's details once. The form feeds the AI role recommendation.
      </PageHeader>
      <div className="grid two wide-left">
        <Card title="New employee">
          <form className="form" onSubmit={submit}>
            <label>Full name<input required value={f.full_name} onChange={set('full_name')} placeholder="Maria Santos" /></label>
            <label>Work email<input type="email" required value={f.email} onChange={set('email')} placeholder="maria.santos@company.com" /></label>
            <label>Job title<input required value={f.job_title} onChange={set('job_title')} placeholder="HR Coordinator" /></label>
            <div className="row">
              <label>Requested department
                <select value={f.department_id} onChange={set('department_id')}>
                  <option value="">Not sure</option>
                  {(depts.data || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label>Approving manager
                <select required value={f.manager_id} onChange={set('manager_id')}>
                  <option value="">Select manager</option>
                  {(mgrs.data || []).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <label>Start date<input type="date" value={f.start_date} onChange={set('start_date')} /></label>
              <label>Workstation<input value={f.workstation} onChange={set('workstation')} placeholder="Laptop, desk 14" /></label>
            </div>
            {(mgrs.data || []).length === 0 && !mgrs.loading && <div className="alert human">No managers exist yet. Create a user with the Manager role first.</div>}
            <button className="btn" disabled={busy}>Register employee</button>
          </form>
        </Card>

        <Card title="Employees" right={<input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          <ErrorBox error={emps.error} />
          {emps.loading ? <Loading /> : rows.length === 0 ? <Empty>No employees yet.</Empty> : (
            <div className="scroll"><table className="table">
              <thead><tr><th>No.</th><th>Name</th><th>Title</th><th>Manager</th><th>Start</th><th>Status</th></tr></thead>
              <tbody>{rows.map((e) => (
                <tr key={e.id}>
                  <td><code>{e.employee_no}</code></td>
                  <td><strong>{e.full_name}</strong><div className="muted small">{e.email}</div></td>
                  <td>{e.job_title}</td><td>{e.manager?.full_name || '—'}</td><td>{fmtDate(e.start_date)}</td>
                  <td><StatusBadge status={e.status} /></td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
