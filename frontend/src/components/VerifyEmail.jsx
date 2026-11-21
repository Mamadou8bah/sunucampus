import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { VerifiedBadge } from './VerifiedBadge.jsx';

const UTG_DOMAIN = 'utg.edu.gm';
const RESEND_SECONDS = 30;

/**
 * Two steps: send a code to a UTG address, then enter the 6-digit code.
 * Calls onVerified() once the blue tick is earned.
 */
export default function VerifyEmail({ onVerified, compact = false }) {
  const { user, requestVerification, confirmVerification } = useAuth();
  const startsUtg = user.email.endsWith(`@${UTG_DOMAIN}`);
  const [email, setEmail] = useState(startsUtg ? user.email : '');
  const [sent, setSent] = useState(null); // { sentTo, devCode }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  if (user.isVerified) {
    return (
      <div className="verify-done">
        <VerifiedBadge size={56} />
        <h2>You’re verified</h2>
        <p className="muted">The blue tick now shows next to your name, so other students know you’re really at UTG.</p>
      </div>
    );
  }

  async function send(e) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await requestVerification(email.trim().toLowerCase() === user.email ? undefined : email.trim());
      setSent(res);
      setCode('');
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await confirmVerification(code);
      onVerified?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <form onSubmit={send} className="verify">
        {!compact && (
          <div className="verify-hero" aria-hidden="true">
            <VerifiedBadge size={64} />
          </div>
        )}
        <div className="field">
          <label htmlFor="verify-email">UTG email address</label>
          <input
            id="verify-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={`yourname@${UTG_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
          />
          <p className="field-hint">We’ll email you a 6-digit code. Only addresses ending in @{UTG_DOMAIN} can be verified.</p>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Send code'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={confirm} className="verify">
      <p>
        We sent a code to <strong>{sent.sentTo}</strong>. It expires in {sent.expiresInMinutes} minutes.
      </p>
      {sent.devCode && (
        <p className="alert alert-info">
          Demo mode, no email server is set up. Your code is <strong>{sent.devCode}</strong>.
        </p>
      )}
      <div className="field">
        <label htmlFor="verify-code">6-digit code</label>
        <input
          id="verify-code"
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={Boolean(error)}
          autoFocus
        />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : 'Verify'}
      </button>
      <div className="verify-links">
        <button type="button" className="link-button" disabled={wait > 0 || busy} onClick={() => send()}>
          {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        </button>
        <button type="button" className="link-button" onClick={() => setSent(null)}>
          Use a different email
        </button>
      </div>
    </form>
  );
}
