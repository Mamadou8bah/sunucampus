import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import Field from '../components/Field.jsx';
import AuthLayout from './AuthLayout.jsx';

// Demo builds (VITE_DEMO=true) let visitors look around as a seeded student.
// The frontend-only demo (VITE_STATIC_DEMO) also offers the admin dashboard: each visitor has a private copy.
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';
const DEMO = import.meta.env.VITE_DEMO === 'true' || STATIC_DEMO;
const DEMO_ACCOUNTS = ['haddy.darboe10', 'alieu.bojang9', 'awa.jallow0', 'binta.jobe8', 'adama.manneh20', 'ebrima.njie3'];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e, credentials = form) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(credentials);
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in with your university email.">
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" required value={form.email} onChange={update} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required value={form.password} onChange={update} />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      {DEMO && (
        <div className="demo-login">
          <span>Just looking around?</span>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={submitting}
            onClick={(e) => {
              const id = DEMO_ACCOUNTS[Math.floor(Math.random() * DEMO_ACCOUNTS.length)];
              handleSubmit(e, { email: id + '@demo.sunucampus.local', password: 'Password123' });
            }}
          >
            Try a demo account
          </button>
          {STATIC_DEMO && (
            <button type="button" className="btn btn-ghost btn-block" disabled={submitting} onClick={(e) => handleSubmit(e, { email: 'admin@sunucampus.local', password: 'ChangeMe123' })}>
              Explore the admin dashboard
            </button>
          )}
        </div>
      )}
      <p className="auth-switch">
        New to SunuCampus? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
