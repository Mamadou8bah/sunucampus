import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import AppBar from '../components/AppBar.jsx';
import Avatar from '../components/Avatar.jsx';
import Segmented from '../components/Segmented.jsx';
import { MessageButton } from '../components/ConnectButton.jsx';
import { academicLine } from '../lib/profile.js';
import UserName from '../components/VerifiedBadge.jsx';
import { timeAgo } from '../lib/time.js';

function PersonRow({ user, meta, children }) {
  return (
    <li className="person-row">
      <Avatar user={user} size={48} />
      <div className="person-row-text">
        <Link to={`/people/${user.id}`}><UserName user={user} size={16} /></Link>
        <span>{academicLine(user) || 'Programme not set'}</span>
        {meta && <span>{meta}</span>}
      </div>
      <div className="person-row-actions">{children}</div>
    </li>
  );
}

export default function Network() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'connections';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [requests, network] = await Promise.all([api('/connections/requests'), api('/connections')]);
      setData({ ...requests, connections: network.connections });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id, request) {
    setBusy(id);
    setError('');
    try {
      await request();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }
  const respond = (id, action) => act(id, () => api(`/connections/${id}`, { method: 'PATCH', body: { action } }));
  const remove = (id, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    act(id, () => api(`/connections/${id}`, { method: 'DELETE' }));
  };

  return (
    <>
      <AppBar title="Your network" back>
        <Segmented
          label="Network"
          value={tab}
          onChange={(v) => setParams(v === 'connections' ? {} : { tab: v }, { replace: true })}
          options={[
            ['connections', 'Connections'],
            ['requests', 'Requests', data?.incoming.length ?? 0],
            ['sent', 'Sent'],
          ]}
        />
      </AppBar>

      <div className="screen">
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {!data ? (
          !error && <p className="muted">Loading…</p>
        ) : tab === 'requests' ? (
          data.incoming.length === 0 ? (
            <p className="empty">No requests right now.</p>
          ) : (
            <ul className="person-list">
              {data.incoming.map((r) => (
                <PersonRow key={r.id} user={r.user} meta={timeAgo(r.createdAt)}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => respond(r.id, 'accept')}>
                    Accept
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => respond(r.id, 'reject')}>
                    Decline
                  </button>
                </PersonRow>
              ))}
            </ul>
          )
        ) : tab === 'sent' ? (
          data.outgoing.length === 0 ? (
            <p className="empty">You have no pending requests.</p>
          ) : (
            <ul className="person-list">
              {data.outgoing.map((r) => (
                <PersonRow key={r.id} user={r.user} meta={`Sent ${timeAgo(r.createdAt)}`}>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => remove(r.id)}>
                    Cancel
                  </button>
                </PersonRow>
              ))}
            </ul>
          )
        ) : data.connections.length === 0 ? (
          <div className="empty">
            <h2>No connections yet</h2>
            <p>Your matches are a good place to start.</p>
            <Link to="/matches" className="btn btn-primary">
              See my matches
            </Link>
          </div>
        ) : (
          <ul className="person-list">
            {data.connections.map((c) => (
              <PersonRow key={c.id} user={c.user}>
                <MessageButton userId={c.user.id} className="btn btn-soft btn-sm" />
              </PersonRow>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
