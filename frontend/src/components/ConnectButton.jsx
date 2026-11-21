import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client.js';
import Icon from './Icon.jsx';

/** Opens (or creates) the conversation with a connected student. */
export function MessageButton({ userId, className = 'btn btn-primary' }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function openConversation() {
    setBusy(true);
    try {
      const { conversation } = await api('/conversations', { method: 'POST', body: { userId } });
      navigate(`/messages/${conversation.id}`);
    } catch {
      setBusy(false);
    }
  }
  return (
    <button type="button" className={className} disabled={busy} onClick={openConversation}>
      <Icon name="chat" size={20} /> Message
    </button>
  );
}

/**
 * Connection actions for another student's profile.
 * `relation` comes from GET /users/:id; onChange receives the new relation.
 */
export default function ConnectButton({ userId, relation, onChange, source = 'profile' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      onChange(await action());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const connect = () => run(async () => (await api('/connections', { method: 'POST', body: { recipientId: userId, source } })).relation);
  const respond = (action) => run(async () => (await api(`/connections/${relation.connectionId}`, { method: 'PATCH', body: { action } })).relation);
  const remove = (confirmText) =>
    run(async () => {
      if (confirmText && !window.confirm(confirmText)) return relation;
      await api(`/connections/${relation.connectionId}`, { method: 'DELETE' });
      return { status: 'none' };
    });

  let content;
  switch (relation.status) {
    case 'connected':
      content = (
        <>
          <MessageButton userId={userId} />
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remove('Remove this connection?')}>
            <Icon name="check" size={20} /> Connected
          </button>
        </>
      );
      break;
    case 'pending_outgoing':
      content = (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => remove()}>
          Requested. Tap to cancel
        </button>
      );
      break;
    case 'pending_incoming':
      content = (
        <>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => respond('accept')}>
            Accept request
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => respond('reject')}>
            Decline
          </button>
        </>
      );
      break;
    case 'declined':
      content = <span className="connection-state">Request not accepted</span>;
      break;
    default:
      content = (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={connect}>
          <Icon name="people" size={20} /> Connect
        </button>
      );
  }

  return (
    <div className="connect-actions">
      {content}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
