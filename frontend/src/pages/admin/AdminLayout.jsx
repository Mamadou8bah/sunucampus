import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import AppBar from '../../components/AppBar.jsx';

const LINKS = [
  ['/admin', 'Overview', true],
  ['/admin/reports', 'Reports'],
  ['/admin/users', 'Users'],
  ['/admin/posts', 'Posts'],
  ['/admin/communities', 'Communities'],
  ['/admin/statistics', 'Statistics'],
  ['/admin/audit-log', 'Audit log'],
];

export default function AdminLayout() {
  return (
    <>
      <AppBar title="Admin" back="/profile" />
      <nav className="admin-tabs" aria-label="Admin sections">
        {LINKS.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={end}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="admin-content">
        <Suspense fallback={<p className="muted" role="status">Loading admin section…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </>
  );
}
