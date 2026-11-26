import { useLayoutEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocket } from '../realtime/SocketContext.jsx';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import RightRail from './RightRail.jsx';
import UserName from './VerifiedBadge.jsx';
import WarningNotice from './WarningNotice.jsx';

const TABS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/search', label: 'Search', icon: 'search', desktopOnly: true },
  { to: '/matches', label: 'Matches', icon: 'matches' },
  { to: '/communities', label: 'Communities', icon: 'communities' },
  // On phones, Messages lives in Home's header; the tab bar slot is the Marketplace.
  { to: '/messages', label: 'Messages', icon: 'chat', badge: 'unread', desktopOnly: true },
  // On phones, notifications open from the bell in Home's header.
  { to: '/notifications', label: 'Notifications', icon: 'bell', badge: 'notif', desktopOnly: true },
  { to: '/market', label: 'Marketplace', icon: 'bag' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

// Full-screen flows hide the tab bar on phones, like a native app.
const IMMERSIVE = [/^\/post\//, /^\/messages\/[^/]+$/, /^\/welcome/, /^\/profile\/edit/, /^\/market\/.+/];
// Screens that get the right-hand column on wide desktops.
const WITH_RIGHT_RAIL = [/^\/notifications/, /^\/post\//, /^\/search/, /^\/$/, /^\/matches/, /^\/communities/, /^\/c\//, /^\/people\//, /^\/profile\/?$/, /^\/network/];

export default function AppLayout() {
  const { user } = useAuth();
  const { unread, notifUnread } = useSocket();
  const counts = { unread, notif: notifUnread };
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const main = useRef(null);
  const previousPath = useRef(pathname);
  const pageAnimation = useRef(null);
  const desktop = useMediaQuery('(min-width: 1180px)');

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    pageAnimation.current?.cancel();
    pageAnimation.current = null;

    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.activeElement?.matches(':focus-visible')
    ) return;

    // Soften the content swap without moving the layout or animating the shell.
    pageAnimation.current = main.current?.animate?.(
      [{ opacity: 0.9 }, { opacity: 1 }],
      { duration: 140, easing: 'ease-out' },
    );
  }, [pathname, navigationType]);

  useLayoutEffect(() => () => pageAnimation.current?.cancel(), []);

  const immersive = IMMERSIVE.some((r) => r.test(pathname));
  const wide = pathname.startsWith('/admin') || pathname.startsWith('/messages');
  const showRail = desktop && WITH_RIGHT_RAIL.some((r) => r.test(pathname));

  return (
    <div className={`app ${immersive ? 'is-immersive' : ''} ${wide ? 'is-wide' : ''} ${showRail ? 'has-rail' : ''}`}>
      <nav className="tabbar" aria-label="Main">
        <Link to="/" className="rail-brand" aria-label="SunuCampus home">
          <Logo size={30} />
        </Link>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={`tab-link ${t.desktopOnly ? 'desktop-only' : ''}`}>
            <span className="tab-icon">
              <Icon name={t.icon} />
              {t.badge && counts[t.badge] > 0 && (
                <span className="tab-badge" aria-label={`${counts[t.badge]} unread`}>
                  {counts[t.badge] > 99 ? '99+' : counts[t.badge]}
                </span>
              )}
            </span>
            <span className="tab-label">{t.label}</span>
          </NavLink>
        ))}
        <button type="button" className="rail-post" onClick={() => navigate('/?compose=1')}>
          <Icon name="plus" size={20} strokeWidth={2.2} />
          <span>New post</span>
        </button>
        <Link to="/profile" className="rail-me">
          <Avatar user={user} size={40} />
          <span className="rail-me-text">
            <strong>
              <UserName user={user} size={14} />
            </strong>
            <span>{user.programme ?? 'Your profile'}</span>
          </span>
        </Link>
      </nav>
      <div className="app-main" ref={main}>
        <Outlet />
      </div>
      {showRail && <RightRail />}
      {user.role !== 'admin' && <WarningNotice />}
    </div>
  );
}
