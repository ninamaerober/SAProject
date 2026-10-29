import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabase.js';
import { useAsync, fmtDateTime } from '../lib.js';
import { Card, PageHeader, Loading, ErrorBox } from '../components/ui.jsx';

const FLOW = [
  ['HR submits the employee form', false],
  ['AI recommends the role', false],
  ['Manager approves', true],
  ['IT administrator reviews', true],
  ['AD DS account created', false],
  ['Group assigned', false],
  ['Shared folder access', false],
];

export default function Dashboard() {
  const { profile, user } = useAuth();
  const emp = useAsync(() => supabase.from('employees').select('id,status,manager_id'));
  const reqs = useAsync(() => supabase.from('access_requests').select('id,type,status,employee:employees(manager_id)'));
  const audit = useAsync(() => supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(6));

  if (emp.loading || reqs.loading) return <Loading />;
  const E = emp.data || [];
  const R = reqs.data || [];
  const count = (s) => E.filter((e) => e.status === s).length;
  const myApprovals = R.filter((r) => r.status === 'pending_manager' && r.employee?.manager_id === user.id).length;

  const todo = {
    hr: [
      ['Registered, awaiting recommendation', count('registered') + count('recommended') + count('returned'), '/recommendation'],
      ['Waiting on manager', R.filter((r) => r.status === 'pending_manager').length, '/employees'],
    ],
    manager: [['Requests waiting for your decision', myApprovals, '/approvals']],
    it_admin: [
      ['Approved, ready for AD DS account', R.filter((r) => r.type === 'onboarding' && r.status === 'approved').length, '/provisioning'],
      ['Accounts waiting for group assignment', R.filter((r) => r.status === 'account_created').length, '/groups'],
      ['Offboarding requests to approve', R.filter((r) => r.status === 'pending_it').length, '/offboarding'],
    ],
  }[profile.role];

  return (
    <>
      <PageHeader eyebrow="Overview" title={`Welcome, ${profile.full_name.split(' ')[0]}`}>
        Employee lifecycle at a glance.
      </PageHeader>
      <ErrorBox error={emp.error || reqs.error} />

      <div className="grid stats">
        {[['Employees', E.length], ['Active accounts', count('active')], ['Pending approval', count('pending_approval')], ['Offboarded', count('offboarded')]].map(([k, v]) => (
          <div className="stat" key={k}><div className="stat-n">{v}</div><div className="stat-l">{k}</div></div>
        ))}
      </div>

      <div className="grid two">
        <Card title="Your queue">
          {todo.map(([label, n, to]) => (
            <Link to={to} className="todo" key={label}>
              <span>{label}</span><span className={`pill ${n ? 'human' : ''}`}>{n}</span>
            </Link>
          ))}
        </Card>
        <Card title="Example workflow">
          <ol className="flow">
            {FLOW.map(([t, human], i) => (
              <li key={t} className={human ? 'human' : ''}><b>{i + 1}</b>{t}{human && <em>human</em>}</li>
            ))}
          </ol>
          <p className="muted small">Amber steps are human decisions. No account is created before both are complete.</p>
        </Card>
      </div>

      <Card title="Recent activity">
        {audit.loading ? <Loading /> : (audit.data || []).length === 0 ? <div className="empty">No activity yet.</div> : (
          <table className="table"><tbody>
            {audit.data.map((a) => (
              <tr key={a.id}><td><code>{a.action}</code></td><td>{a.actor_name}</td><td className="muted">{fmtDateTime(a.created_at)}</td></tr>
            ))}
          </tbody></table>
        )}
      </Card>
    </>
  );
}
