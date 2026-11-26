import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import { StatTile } from '../../components/charts/Charts.jsx';
import { describeAction } from './auditText.js';
import { timeAgo } from '../../lib/time.js';
import { COMMUNITY_STATUS_LABELS } from '../../lib/communities.js';

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/overview')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="alert alert-error" role="alert">
        {error}
      </div>
    );
  }
  if (!data) return <p className="muted">Loading overview…</p>;
  const c = data.counts;

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Overview</h1>
        <Link to="/admin/statistics">View full statistics</Link>
      </div>

      {(c.openReports > 0 || c.pendingCommunities > 0) && (
        <div className="attention-row">
          {c.openReports > 0 && (
            <Link to="/admin/reports" className="attention">
              <strong>{c.openReports}</strong> open {c.openReports === 1 ? 'report' : 'reports'} to review
            </Link>
          )}
          {c.pendingCommunities > 0 && (
            <Link to="/admin/communities" className="attention">
              <strong>{c.pendingCommunities}</strong> {c.pendingCommunities === 1 ? 'community' : 'communities'} awaiting approval
            </Link>
          )}
        </div>
      )}

      <div className="stat-grid">
        <StatTile label="Total users" value={c.totalUsers} hint={`${c.newUsersWeek} new this week`} />
        <StatTile label="Active in last 7 days" value={c.activeWeek} />
        <StatTile label="Visible posts" value={c.postsTotal} hint={`${c.postsDay} in the last 24 hours`} />
        <StatTile label="Active communities" value={c.activeCommunities} />
        <StatTile label="Open reports" value={c.openReports} />
        <StatTile label="Suspended or banned" value={c.suspended} />
      </div>

      <div className="two-col">
        <section className="card">
          <div className="section-header">
            <h2>Recent posts</h2>
            <Link to="/admin/posts">All posts</Link>
          </div>
          {data.recentPosts.length === 0 ? <p className="muted">No visible posts yet.</p> : (
            <ul className="simple-list">
              {data.recentPosts.map((post) => (
                <li key={post.id}>
                  <div>
                    <Link to={`/post/${post.id}`}>{post.excerpt}</Link>
                    <div className="muted">{post.author ?? 'Deleted user'}</div>
                  </div>
                  <time className="muted" dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="section-header">
            <h2>Newest communities</h2>
            <Link to="/admin/communities">All communities</Link>
          </div>
          {data.recentCommunities.length === 0 ? <p className="muted">No communities yet.</p> : (
            <ul className="simple-list">
              {data.recentCommunities.map((community) => (
                <li key={community.id}>
                  <div>
                    <Link to={`/c/${community.slug}`}>{community.name}</Link>
                    <div className="muted">{COMMUNITY_STATUS_LABELS[community.status]}</div>
                  </div>
                  <time className="muted" dateTime={community.createdAt}>{timeAgo(community.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="section-header">
            <h2>Newest students</h2>
            <Link to="/admin/users">All users</Link>
          </div>
          {data.recentUsers.length === 0 ? (
            <p className="muted">No users yet.</p>
          ) : (
            <ul className="simple-list">
              {data.recentUsers.map((u) => (
                <li key={u.id}>
                  <div>
                    <strong>{u.name}</strong>
                    <span className="muted"> · {u.programme ?? u.email}</span>
                  </div>
                  <time className="muted">{timeAgo(u.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="section-header">
            <h2>Recent admin activity</h2>
            <Link to="/admin/audit-log">Audit log</Link>
          </div>
          {data.recentActions.length === 0 ? (
            <p className="muted">No administrative actions yet.</p>
          ) : (
            <ul className="simple-list">
              {data.recentActions.map((log) => (
                <li key={log.id}>
                  <div>
                    <strong>{log.actor?.name ?? 'Deleted user'}</strong> <span>{describeAction(log)}</span>
                  </div>
                  <time className="muted">{timeAgo(log.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
