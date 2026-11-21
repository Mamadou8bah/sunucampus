import { useState } from 'react';
import { api } from '../api/client.js';
import Sheet from './Sheet.jsx';

const REASONS = {
  spam: 'Spam or advertising',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate or offensive',
  misinformation: 'False information',
  impersonation: 'Pretending to be someone else',
  other: 'Something else',
};

const NOUNS = { post: 'post', comment: 'comment', community: 'community', user: 'profile', listing: 'listing' };

/** Bottom sheet that sends a report to the admin moderation queue. */
export function ReportSheet({ open, onClose, targetType, targetId }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');
  const noun = NOUNS[targetType];

  function close() {
    onClose();
    // Reset after the sheet has closed.
    setTimeout(() => {
      setReason('');
      setDetails('');
      setState('idle');
      setError('');
    }, 250);
  }

  async function submit(e) {
    e.preventDefault();
    if (!reason) {
      setError('Choose a reason');
      return;
    }
    setState('sending');
    setError('');
    try {
      await api('/reports', { method: 'POST', body: { targetType, targetId, reason, details: details || undefined } });
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('idle');
    }
  }

  return (
    <Sheet open={open} onClose={close} title={state === 'sent' ? 'Report sent' : `Report this ${noun}`}>
      {state === 'sent' ? (
        <>
          <p>An administrator will review this {noun}. The person you reported won’t know it was you.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={close}>
            Done
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset className="choice-grid">
            <legend className="field-label">Why are you reporting it?</legend>
            {Object.entries(REASONS).map(([value, label]) => (
              <label key={value} className="choice">
                <input type="radio" name="report-reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="field" style={{ marginTop: '1rem' }}>
            <label htmlFor="report-details">More details (optional)</label>
            <textarea id="report-details" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send report'}
          </button>
        </form>
      )}
    </Sheet>
  );
}

/** A text button that opens the report sheet. */
export default function ReportButton({ targetType, targetId, className = 'link-button', label = 'Report' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ReportSheet open={open} onClose={() => setOpen(false)} targetType={targetType} targetId={targetId} />
    </>
  );
}
