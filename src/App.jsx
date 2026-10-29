import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { configured } from './supabase.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import Recommendation from './pages/Recommendation.jsx';
import Approvals from './pages/Approvals.jsx';
import Provisioning from './pages/Provisioning.jsx';
import GroupAssignment from './pages/GroupAssignment.jsx';
import AccessReview from './pages/AccessReview.jsx';
import Offboarding from './pages/Offboarding.jsx';
import Rules from './pages/Rules.jsx';
import AuditLog from './pages/AuditLog.jsx';

function Protected({ children }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="center-screen">Profile not found. Sign out and sign up again.</div>;
  return children;
}

function Guard({ roles, children }) {
  const { profile } = useAuth();
  if (!roles.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  if (!configured) {
    return (
      <div className="center-screen">
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Supabase is not configured</h3>
          <p>Copy <code>.env.example</code> to <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (or the legacy <code>VITE_SUPABASE_ANON_KEY</code>), then restart <code>npm run dev</code>.</p>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Guard roles={['hr']}><Employees /></Guard>} />
        <Route path="recommendation" element={<Guard roles={['hr']}><Recommendation /></Guard>} />
        <Route path="approvals" element={<Guard roles={['manager']}><Approvals /></Guard>} />
        <Route path="provisioning" element={<Guard roles={['it_admin']}><Provisioning /></Guard>} />
        <Route path="groups" element={<Guard roles={['it_admin']}><GroupAssignment /></Guard>} />
        <Route path="access-review" element={<Guard roles={['it_admin']}><AccessReview /></Guard>} />
        <Route path="offboarding" element={<Guard roles={['hr', 'it_admin']}><Offboarding /></Guard>} />
        <Route path="rules" element={<Guard roles={['it_admin']}><Rules /></Guard>} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
