import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Sheet from '../../components/Sheet.jsx';

const TEMPLATES = [
  ['Spam', 'Your recent posts look like spam or advertising. Please keep SunuCampus for campus life, study and networking.'],
  ['Respect', 'Some of your messages were reported as disrespectful to other students. Please keep conversations kind and respectful.'],
  ['Off-topic', 'Your post didn’t fit the community it was shared in. Please post in the right community.'],
  ['False info', 'Your post shared information that appears to be false or misleading. Please check facts before sharing.'],
];

/** Admin sheet for sending a formal warning to a student. */
export default function WarnSheet({ open, onClose, user, targetType, targetId, onDone }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setMessage('');
      setError('');
    }
  }, [open]);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api(`/admin/users/${user.id}/warn`, { method: 'POST', body: { message, targetType, targetId } });
      onDone?.(res.user);
      onClose();
    } catch (err) {
      setError(err.fieldErrors?.().message ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={user ? `Warn ${user.name}` : 'Send a warning'}
      footer={
        <button type="submit" form="warn-form" className="btn btn-primary btn-block" disabled={busy || message.trim().length < 10}>
          {busy ? 'Sending…' : 'Send warning'}
        </button>
      }
    >
      <form id="warn-form" className="warn-form" onSubmit={send}>
        <p className="warn-help">They’ll see this straight away, and it’s added to their account and the audit log.</p>
        <div className="warn-templates" aria-label="Start from a template">
          {TEMPLATES.map(([label, text]) => (
            <button key={label} type="button" className={`filter-chip ${message === text ? 'is-on' : ''}`} onClick={() => setMessage(text)}>
              {label}
            </button>
          ))}
        </div>
        <label htmlFor="warn-message" className="visually-hidden">
          Warning message
        </label>
        <textarea id="warn-message" rows={5} maxLength={1000} placeholder="Explain what happened and what you expect from them…" value={message} onChange={(e) => setMessage(e.target.value)} />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
