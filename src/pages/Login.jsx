import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../components/ui.jsx';

export default function Login() {
  const { session, signIn } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (session) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const res = await signIn(f.email, f.password);
    setBusy(false);
    if (res.error) return toast.err(res.error.message);
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="eyebrow light">Project proposal · Identity and access management</div>
        <h1>AccessFlow AI</h1>
        <p>Employee onboarding and access management that AI speeds up and administrators still control.</p>
        <div className="steps-inline"><span>Register</span><span>Recommend</span><span className="human">Approve</span><span className="human">Provision</span></div>
      </div>
      <form className="card login-card" onSubmit={submit}>
        <h3>Sign in</h3>
        <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required minLength={6} value={f.password} onChange={set('password')} /></label>
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
        <p className="muted small">Accounts are provided by your administrator. Contact HR if you need access.</p>
      </form>
    </div>
  );
}
