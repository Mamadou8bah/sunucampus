import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import Splash from '../components/Splash.jsx';

/**
 * Guards a group of routes. With `roles`, only users with one of those roles may enter.
 * This only hides screens; the API enforces the same rules on every request.
 */
export function RequireAuth({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!user) {
    // First visit on this device: show the intro screens before asking anyone to log in.
    const seenIntro = localStorage.getItem('sunucampus.introSeen');
    return <Navigate to={seenIntro ? '/login' : '/intro'} replace state={{ from: location }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <main className="centered-message">
        <h1>You don’t have access to this page</h1>
        <p>This area is only available to {roles.join(' or ')} accounts.</p>
      </main>
    );
  }
  return <Outlet />;
}

/** Sends signed-in users away from the login and register pages. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
