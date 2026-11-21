import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Pagination from '../../components/Pagination.jsx';
import { fullDate, timeAgo } from '../../lib/time.js';
import Select from '../../components/Select.jsx';
import WarnSheet from './WarnSheet.jsx';

const STATUS_BADGE = { visible: 'badge-status-active', hidden: 'badge-status-suspended', removed: 'badge-status-banned' };

export default function AdminPosts() {
  const [filters, setFilters] = useState({ status: '', reported: '', q: '', page: 1 });
  const [warning, setWarning] = useState(null); // post whose author is being warned
  const [warned, setWarned] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError('');
    api('/admin/posts', { query: filters })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters]);

  useEffect(load, [load]);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function setStatus(post, status) {
    let reason;
    if (status !== 'visible') {
      reason = window.prompt(`Reason for marking this post as ${status}?`);
      if (reason === null) return;
    }
    setBusyId(post.id);
    try {
      await api(`/admin/posts/${post.id}/status`, { method: 'PATCH', body: { status, reason: reason || undefined } });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }


  return (
    <>
      <div className="page-header">
        <h1>Posts</h1>
        {data && <p className="muted">{data.total} total</p>}
      </div>
      <div className="toolbar" role="search">
        <input type="search" placeholder="Search post text" aria-label="Search posts" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          label="Status"
          variant="pill"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v, page: 1 })}
          options={[
            ['', 'All statuses'],
            ['visible', 'Visible'],
            ['hidden', 'Hidden'],
            ['removed', 'Removed'],
          ]}
        />
        <Select
          label="Reported"
          variant="pill"
          value={filters.reported}
          onChange={(v) => setFilters({ ...filters, reported: v, page: 1 })}
          options={[
            ['', 'Reported or not'],
            ['true', 'With open reports'],
          ]}
        />
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {!data ? (
        !error && <p className="muted">Loading posts…</p>
      ) : data.posts.length === 0 ? (
        <p className="empty">No posts match.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">Post</th>
                <th scope="col">Author</th>
                <th scope="col">Status</th>
                <th scope="col">Posted</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.posts.map((p) => (
                <tr key={p.id}>
                  <td data-label="Post" className="post-cell">
                    <p className="post-excerpt">{p.content}</p>
                    <p className="cell-secondary">
                      {p.community ? `In ${p.community.name}` : 'Campus feed'} · {p.likeCount} likes · {p.commentCount} comments
                      {p.openReports > 0 && (
                        <span className="badge badge-status-banned">
                          {' '}
                          {p.openReports} open {p.openReports === 1 ? 'report' : 'reports'}
                        </span>
                      )}
                    </p>
                  </td>
                  <td data-label="Author">
                    <div className="cell-primary">{p.author?.name ?? 'Deleted user'}</div>
                    <div className="cell-secondary">{p.author?.email}</div>
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                    {p.moderatedBy && (
                      <div className="cell-secondary">
                        by {p.moderatedBy.name}
                        {p.moderationReason && `: ${p.moderationReason}`}
                      </div>
                    )}
                  </td>
                  <td data-label="Posted" className="nowrap" title={fullDate(p.createdAt)}>
                    {timeAgo(p.createdAt)}
                  </td>
                  <td className="row-actions">
                    {p.status !== 'visible' && (
                      <button type="button" className="btn btn-ghost" disabled={busyId === p.id} onClick={() => setStatus(p, 'visible')}>
                        Restore
                      </button>
                    )}
                    {p.status === 'visible' && (
                      <button type="button" className="btn btn-ghost" disabled={busyId === p.id} onClick={() => setStatus(p, 'hidden')}>
                        Hide
                      </button>
                    )}
                    {p.status !== 'removed' && (
                      <button type="button" className="btn btn-danger-quiet" disabled={busyId === p.id} onClick={() => setStatus(p, 'removed')}>
                        Remove
                      </button>
                    )}
                    {p.author && p.author.role !== 'admin' && (
                      <button type="button" className="btn btn-ghost" onClick={() => setWarning(p)}>
                        Warn author
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ ...filters, page })} />}
      {warned && (
        <div className="alert alert-success" role="status">
          {warned}
        </div>
      )}
      <WarnSheet
        open={Boolean(warning)}
        onClose={() => setWarning(null)}
        user={warning?.author}
        targetType="post"
        targetId={warning?.id}
        onDone={() => setWarned(`Warning sent to ${warning.author.name}`)}
      />
    </>
  );
}
