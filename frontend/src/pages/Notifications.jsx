import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import AppBar from '../components/AppBar.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Sheet from '../components/Sheet.jsx';
import { useSocket } from '../realtime/SocketContext.jsx';
import { timeAgo } from '../lib/time.js';

const SUBJECTS = { post: 'post', comment: 'reply', listing: 'listing', community: 'community', user: 'profile' };

/** "Awa", "Awa and Lamin", "Awa and 3 others" */
function who(n) {
  const [a, b] = n.actors;
  if (!a) return 'Someone';
  const first = <strong>{a.name}</strong>;
  if (n.actorCount <= 1) return first;
  if (n.actorCount === 2 && b) {
    return (
      <>
        {first} and <strong>{b.name}</strong>
      </>
    );
  }
  return (
    <>
      {first} and {n.actorCount - 1} others
    </>
  );
}

/** What the row says, where it leads and which small icon marks it. */
function describe(n) {
  const quote = (t) => t && <span className="nt-quote">{t}</span>;
  switch (n.type) {
    case 'like':
      return { badge: 'heart', tone: 'like', to: n.post && `/post/${n.post.id}`, body: <>{who(n)} liked your post {quote(n.post?.excerpt)}</> };
    case 'comment':
      return { badge: 'comment', tone: 'reply', to: n.post && `/post/${n.post.id}?reply=1`, body: <>{who(n)} replied: {quote(n.text)}</> };
    case 'connection_request':
      return { badge: 'user', tone: 'people', to: '/network?tab=requests', body: <>{who(n)} wants to connect with you</>, cta: 'View' };
    case 'connection_accepted':
      return { badge: 'check', tone: 'people', to: n.actors[0] && `/people/${n.actors[0].id}`, body: <>{who(n)} accepted your request. Say hello!</> };
    case 'community_approved':
      return {
        system: true,
        to: n.community && `/c/${n.community.slug}`,
        body: (
          <>
            <strong>{n.community?.name ?? 'Your community'}</strong> is live. You’re its moderator, so invite people and post first.
          </>
        ),
      };
    case 'community_rejected':
      return {
        system: true,
        body: (
          <>
            <strong>{n.community?.name ?? 'Your community'}</strong> wasn’t approved{n.text ? `: ${n.text}` : '.'}
          </>
        ),
      };
    case 'content_moderated':
      return {
        system: true,
        sheet: true,
        body: (
          <>
            The SunuCampus team took down your {SUBJECTS[n.subject] ?? 'post'}
            {n.text ? `: ${n.text}` : '.'}
          </>
        ),
      };
    case 'warning':
      return {
        system: true,
        warning: true,
        sheet: true,
        body: (
          <>
            <strong>Warning from the SunuCampus team.</strong> {quote(n.text)}
          </>
        ),
      };
    default:
      return { body: 'New activity' };
  }
}

function Row({ n, onOpenSheet }) {
  const d = describe(n);
  const inner = (
    <>
      <span className="nt-avatar">
        {d.system ? (
          <span className={`nt-system ${d.warning ? 'is-warning' : ''}`}>
            {d.warning ? <Icon name="shield" size={22} /> : <img src="/brand/sunucampus-mark.png" alt="" width={30} height={30} />}
          </span>
        ) : (
          <>
            {n.actors[0] && <Avatar user={n.actors[0]} size={48} />}
            <span className={`nt-badge nt-badge-${d.tone}`}>
              <Icon name={d.badge} size={12} strokeWidth={2.4} />
            </span>
          </>
        )}
      </span>
      <span className="nt-text">
        <span className="nt-body">{d.body}</span>
        <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
      </span>
      {d.cta && <span className="nt-cta">{d.cta}</span>}
      {!n.read && <span className="nt-dot" aria-label="Unread" />}
    </>
  );
  const cls = `nt-row ${n.read ? '' : 'is-unread'} ${d.warning ? 'is-warning' : ''}`;
  if (d.sheet) {
    return (
      <button type="button" className={cls} onClick={() => onOpenSheet(n)}>
        {inner}
      </button>
    );
  }
  return d.to ? (
    <Link to={d.to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default function Notifications() {
  const { setNotifUnread, latestNotification } = useSocket();
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const sentinel = useRef(null);

  /** Marks everything except warnings as read; a warning is read when the student acknowledges it. */
  const markSeen = useCallback(
    (list) => {
      const ids = list.filter((n) => !n.read && n.type !== 'warning').map((n) => n.id);
      if (!ids.length) return;
      api('/notifications/read', { method: 'POST', body: { ids } })
        .then((d) => setNotifUnread(d.unread))
        .catch(() => {});
    },
    [setNotifUnread],
  );

  useEffect(() => {
    api('/notifications', { query: { limit: 30 } })
      .then((d) => {
        setItems(d.notifications);
        setCursor(d.nextCursor);
        markSeen(d.notifications);
      })
      .catch((err) => setError(err.message));
  }, [markSeen]);

  // Live updates while the screen is open (a grouped like replaces its older version).
  useEffect(() => {
    if (!latestNotification) return;
    setItems((list) => (list ? [latestNotification, ...list.filter((n) => n.id !== latestNotification.id)] : list));
    markSeen([latestNotification]);
  }, [latestNotification, markSeen]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await api('/notifications', { query: { limit: 30, before: cursor } });
      setItems((list) => [...list, ...d.notifications.filter((n) => !list.some((x) => x.id === n.id))]);
      setCursor(d.nextCursor);
      markSeen(d.notifications);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, markSeen]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return undefined;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  async function acknowledge(n) {
    setOpen(null);
    if (n.read) return;
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      const d = await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } });
      setNotifUnread(d.unread);
    } catch {
      // Stays unread; the student can open it again.
    }
  }

  const fresh = items?.filter((n) => !n.read) ?? [];
  const earlier = items?.filter((n) => n.read) ?? [];

  return (
    <main className="nt">
      <AppBar title="Notifications" back="/" />
      {error && <p className="sr-message">{error}</p>}
      {!items && !error && <p className="sr-message">Loading…</p>}
      {items?.length === 0 && (
        <div className="nt-empty">
          <span className="nt-empty-icon">
            <Icon name="bell" size={34} />
          </span>
          <strong>Nothing yet</strong>
          <span>Likes, replies and connection requests will show up here.</span>
          <Link to="/matches" className="btn btn-primary">
            Find people to connect with
          </Link>
        </div>
      )}
      {fresh.length > 0 && (
        <section aria-labelledby="nt-new">
          <h2 id="nt-new" className="nt-heading">
            New
          </h2>
          {fresh.map((n) => (
            <Row key={n.id} n={n} onOpenSheet={setOpen} />
          ))}
        </section>
      )}
      {earlier.length > 0 && (
        <section aria-labelledby="nt-earlier">
          <h2 id="nt-earlier" className="nt-heading">
            {fresh.length ? 'Earlier' : 'Recent'}
          </h2>
          {earlier.map((n) => (
            <Row key={n.id} n={n} onOpenSheet={setOpen} />
          ))}
        </section>
      )}
      <div ref={sentinel} />
      {loadingMore && <p className="sr-message">Loading…</p>}

      <NoticeSheet notification={open} onClose={() => open && acknowledge(open)} />
    </main>
  );
}

/** Full text of a warning or a moderation notice. Used here and by the app-wide warning popup. */
export function NoticeSheet({ notification: n, onClose }) {
  const warning = n?.type === 'warning';
  return (
    <Sheet
      open={Boolean(n)}
      onClose={onClose}
      title={warning ? 'A warning from the SunuCampus team' : 'Message from the SunuCampus team'}
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
          I understand
        </button>
      }
    >
      {n && (
        <div className="notice">
          <span className={`notice-icon ${warning ? 'is-warning' : ''}`}>
            <Icon name="shield" size={30} />
          </span>
          <p className="notice-text">
            {n.type === 'content_moderated'
              ? `We took down your ${SUBJECTS[n.subject] ?? 'post'} because it broke the community guidelines${n.text ? `: ${n.text}` : '.'}`
              : n.text}
          </p>
          <p className="notice-foot">
            {warning
              ? 'Repeated warnings can lead to your account being suspended. If you think this is a mistake, contact the SunuCampus team.'
              : 'If you think this is a mistake, contact the SunuCampus team.'}
          </p>
          <time className="notice-time" dateTime={n.createdAt}>
            {timeAgo(n.createdAt)}
          </time>
        </div>
      )}
    </Sheet>
  );
}
