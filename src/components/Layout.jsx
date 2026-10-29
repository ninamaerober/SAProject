import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { ROLE_LABEL } from '../lib.js';

const NAV = {
  hr: [
    ['/', 'Dashboard'],
    ['/employees', '01 Employee registration'],
    ['/recommendation', '02 AI role recommendation'],
    ['/offboarding', '07 Offboarding'],
    ['/audit', 'Audit log'],
  ],
  manager: [
    ['/', 'Dashboard'],
    ['/approvals', '03 Approval workflow'],
    ['/audit', 'Audit log'],
  ],
  it_admin: [
    ['/', 'Dashboard'],
    ['/provisioning', '04 AD DS integration'],
    ['/groups', '05 Group assignment'],
    ['/access-review', '06 Access review'],
    ['/offboarding', '07 Offboarding'],
    ['/rules', 'Recommendation rules'],
    ['/audit', 'Audit log'],
  ],
};

export default function Layout() {
  const { profile, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">AF</span>
          <div>
            <strong>AccessFlow AI</strong>
            <small>Identity &amp; access management</small>
          </div>
        </div>
        <nav>
          {NAV[profile.role].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <div className="me-name">{profile.full_name}</div>
          <div className="me-role">{ROLE_LABEL[profile.role]}</div>
          <button className="btn ghost small" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <div className="rule-banner">AI recommends. People decide. Every change is written to the audit log.</div>
        <Outlet />
      </main>
    </div>
  );
}
