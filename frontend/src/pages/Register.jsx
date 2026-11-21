import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import Field from '../components/Field.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      await register(form);
      navigate('/welcome', { replace: true });
    } catch (err) {
      const byField = err.fieldErrors?.() ?? {};
      setFieldErrors(byField);
      if (Object.keys(byField).length === 0) setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="It takes about a minute.">
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Full name" name="name" autoComplete="name" required value={form.name} onChange={update} error={fieldErrors.name} />
        <Field
          label="University email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update}
          error={fieldErrors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update}
          error={fieldErrors.password}
          hint="At least 8 characters, with a letter and a number."
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
