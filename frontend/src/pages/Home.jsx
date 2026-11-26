import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, STATIC_DEMO } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AppBar from '../components/AppBar.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useSocket } from '../realtime/SocketContext.jsx';
import Logo from '../components/Logo.jsx';
import PostComposer from '../components/PostComposer.jsx';
import PostList from '../components/PostList.jsx';
import Segmented from '../components/Segmented.jsx';
import { firstName, isProfileComplete } from '../lib/profile.js';

function PeopleStrip() {
  const [matches, setMatches] = useState(null);
  useEffect(() => {
    api(STATIC_DEMO ? '/matches' : '/matches/people', { query: { limit: 10 } })
      .then((d) => setMatches(d.recommendations ?? d.matches))
      .catch(() => setMatches([]));
  }, []);

  if (!matches || matches.length === 0) return null;
  return (
    <section aria-labelledby="people-title">
      <div className="section-head">
        <h2 id="people-title">{STATIC_DEMO ? 'People you might click with' : 'People you may know'}</h2>
        <Link to={STATIC_DEMO ? '/matches' : '/matches?tab=people'}>See all</Link>
      </div>
      <div className="people-strip">
        {matches.map((m) => (
          <Link key={m.user.id} to={`/people/${m.user.id}`} state={{ source: STATIC_DEMO ? 'match' : 'discover' }} className="person-bubble">
            <span className="person-bubble-ring" style={{ '--score': m.score }}>
              <Avatar user={m.user} size={62} />
              {STATIC_DEMO && <span className="person-bubble-score">{m.score}%</span>}
            </span>
            <span className="person-bubble-name">{firstName(m.user.name)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RequestBanner() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    api('/connections/requests')
      .then((d) => setCount(d.incoming.length))
      .catch(() => {});
  }, []);
  if (!count) return null;
  return (
    <Link to="/network?tab=requests" className="request-banner home-requests">
      <Icon name="people" />
      <span>{count === 1 ? '1 student wants to connect' : `${count} students want to connect`}</span>
      <Icon name="forward" size={20} />
    </Link>
  );
}

export default function Home() {
  const { user, hasRole } = useAuth();
  const complete = isProfileComplete(user);
  const [scope, setScope] = useState('foryou');
  const [headerHidden, setHeaderHidden] = useState(false);
  const { unread, notifUnread } = useSocket();
  const [composing, setComposing] = useState(false);
  const [params, setParams] = useSearchParams();

  // The desktop rail's New post button links here with ?compose=1.
  useEffect(() => {
    if (params.get('compose')) {
      setComposing(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const [newPost, setNewPost] = useState(null);

  useEffect(() => {
    let anchor = Math.max(0, window.scrollY);
    let hidden = false;
    function updateHeader() {
      const top = Math.max(0, window.scrollY);
      const change = top - anchor;
      const next = top <= 8 || change <= -4 ? false : change >= 10 ? true : hidden;
      if (next !== hidden) {
        hidden = next;
        anchor = top;
        setHeaderHidden(hidden);
      } else if (top <= 8 || (hidden ? change > 0 : change < 0)) {
        anchor = top;
      }
    }
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  return (
    <>
      <AppBar
        large
        className={headerHidden ? 'home-appbar is-hidden' : 'home-appbar'}
        title={
          <>
            <span className="only-mobile">
              <Logo size={32} />
            </span>
            <span className="only-desktop">Home</span>
          </>
        }
        actions={
          <>
            <Link to="/search" className="icon-button" aria-label="Search">
              <Icon name="search" />
            </Link>
            <Link to="/notifications" className="icon-button header-messages header-bell" aria-label={notifUnread ? `Notifications, ${notifUnread} new` : 'Notifications'}>
              <Icon name="bell" />
              {notifUnread > 0 && <span className="header-badge">{notifUnread > 99 ? '99+' : notifUnread}</span>}
            </Link>
            <Link to="/messages" className="icon-button header-messages" aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}>
              <Icon name="chat" />
              {unread > 0 && <span className="header-badge">{unread > 99 ? '99+' : unread}</span>}
            </Link>
          </>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1rem' }}>
        {hasRole('admin') && (
          <Link to="/admin" className="request-banner" style={{ background: 'var(--info-soft)', color: 'var(--info-ink)' }}>
            <Icon name="shield" />
            <span>Open the admin dashboard</span>
            <Icon name="forward" size={20} />
          </Link>
        )}
        <RequestBanner />
        {!complete && !hasRole('admin') && (
          <section className="callout">
            <h2>Finish your profile to get matched</h2>
            <p>Add your programme, what you’re looking for and a few interests. It takes a minute.</p>
            <Link to="/welcome" className="btn btn-primary">
              Finish my profile
            </Link>
          </section>
        )}
        {(!STATIC_DEMO || complete) && <PeopleStrip />}
      </div>

      <div className="feed-tabs">
        <Segmented
          label="Feed"
          value={scope}
          onChange={setScope}
          options={[
            ['foryou', 'For you'],
            ['friends', 'Friends'],
          ]}
        />
      </div>

      <PostList
        key={scope}
        query={scope === 'foryou' ? (STATIC_DEMO ? { scope: 'campus' } : { scope, rank: 'relevant' }) : { scope }}
        prepend={newPost}
        emptyText={
          scope === 'foryou'
            ? 'No posts yet. Connect with other students or join a community to see more.'
            : 'Posts from you and your friends will appear here.'
        }
      />

      <button type="button" className="fab fab-home" onClick={() => setComposing(true)} aria-label="New post">
        <Icon name="plus" size={28} strokeWidth={2.2} />
      </button>
      <PostComposer open={composing} onClose={() => setComposing(false)} onPosted={setNewPost} />
    </>
  );
}
