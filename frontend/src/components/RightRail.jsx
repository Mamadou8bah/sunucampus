import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import UserName from './VerifiedBadge.jsx';
import { CommunityMark } from '../pages/Communities.jsx';
import { academicLine, isProfileComplete } from '../lib/profile.js';
import { useOptions } from '../lib/useOptions.js';

function Suggested() {
  const [matches, setMatches] = useState(null);
  const [sent, setSent] = useState({});

  useEffect(() => {
    api('/matches', { query: { limit: 5 } })
      .then((d) => setMatches(d.matches))
      .catch(() => setMatches([]));
  }, []);

  async function connect(userId) {
    setSent((s) => ({ ...s, [userId]: 'sending' }));
    try {
      await api('/connections', { method: 'POST', body: { recipientId: userId, source: 'match' } });
      setSent((s) => ({ ...s, [userId]: 'sent' }));
    } catch {
      setSent((s) => ({ ...s, [userId]: undefined }));
    }
  }

  if (!matches?.length) return null;
  return (
    <section className="rr-section">
      <div className="rr-head">
        <h2>Suggested for you</h2>
        <Link to="/matches">See all</Link>
      </div>
      <ul className="rr-list">
        {matches.map((m) => (
          <li key={m.user.id} className="rr-person">
            <Link to={`/people/${m.user.id}`} state={{ source: 'match' }} className="rr-person-link">
              <Avatar user={m.user} size={44} />
              <span className="rr-person-text">
                <strong>
                  <UserName user={m.user} size={14} />
                </strong>
                <span>
                  {m.score}% match, {academicLine(m.user) || 'UTG student'}
                </span>
              </span>
            </Link>
            <button type="button" className="rr-action" disabled={Boolean(sent[m.user.id])} onClick={() => connect(m.user.id)}>
              {sent[m.user.id] === 'sent' ? 'Requested' : 'Connect'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Communities() {
  const [items, setItems] = useState(null);
  const [joined, setJoined] = useState({});

  useEffect(() => {
    api('/communities', { query: { limit: 4 } })
      .then((d) => setItems(d.communities))
      .catch(() => setItems([]));
  }, []);

  async function join(id) {
    setJoined((j) => ({ ...j, [id]: true }));
    try {
      await api(`/communities/${id}/join`, { method: 'POST' });
    } catch {
      setJoined((j) => ({ ...j, [id]: false }));
    }
  }

  if (!items?.length) return null;
  return (
    <section className="rr-section">
      <div className="rr-head">
        <h2>Popular communities</h2>
        <Link to="/communities">See all</Link>
      </div>
      <ul className="rr-list">
        {items.map((c) => {
          const isMember = c.isMember || joined[c.id];
          return (
            <li key={c.id} className="rr-person">
              <Link to={`/c/${c.slug}`} className="rr-person-link">
                <CommunityMark community={c} size={44} />
                <span className="rr-person-text">
                  <strong>{c.name}</strong>
                  <span>{c.memberCount === 1 ? '1 member' : `${c.memberCount} members`}</span>
                </span>
              </Link>
              <button type="button" className={`rr-action ${isMember ? 'is-done' : ''}`} disabled={isMember} onClick={() => join(c.id)}>
                {isMember ? 'Joined' : 'Join'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Trending() {
  const options = useOptions();
  if (!options?.interests?.length) return null;
  return (
    <section className="rr-section">
      <div className="rr-head">
        <h2>Trending interests</h2>
      </div>
      <div className="rr-tags">
        {options.interests.slice(0, 10).map((i) => (
          <Link key={i} to={`/search?q=${encodeURIComponent(i)}`} className="rr-tag">
            {i}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Requests() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    api('/connections/requests')
      .then((d) => setCount(d.incoming.length))
      .catch(() => {});
  }, []);
  if (!count) return null;
  return (
    <Link to="/network?tab=requests" className="rr-banner">
      <Icon name="people" size={20} />
      <span>{count === 1 ? '1 connection request' : `${count} connection requests`}</span>
      <Icon name="forward" size={18} />
    </Link>
  );
}

/** Desktop-only right column (X / Instagram style): search, suggestions, communities, trends. */
export default function RightRail() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  return (
    <aside className="right-rail" aria-label="Suggestions">
      <form
        className="rr-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Icon name="search" size={18} />
        <input type="search" placeholder="Search SunuCampus" aria-label="Search SunuCampus" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>

      <Requests />
      {!isProfileComplete(user) && (
        <Link to="/welcome" className="rr-banner">
          <Icon name="sparkles" size={20} />
          <span>Finish your profile to get matches</span>
          <Icon name="forward" size={18} />
        </Link>
      )}
      <Suggested />
      <Communities />
      <Trending />

      <footer className="rr-footer">
        <span>SunuCampus for The University of The Gambia</span>
        <span>© {new Date().getFullYear()} SunuCampus</span>
      </footer>
    </aside>
  );
}
