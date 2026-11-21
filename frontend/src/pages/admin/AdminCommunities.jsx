import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import Pagination from '../../components/Pagination.jsx';
import { CATEGORY_LABELS, COMMUNITY_STATUS_LABELS } from '../../lib/communities.js';
import { timeAgo } from '../../lib/time.js';

const TABS = ['pending', 'active', 'archived', 'rejected'];
const STATUS_BADGE = {
  pending: 'badge-status-suspended',
  active: 'badge-status-active',
  archived: '',
  rejected: 'badge-status-banned',
};

export default function AdminCommunities() {
  const [filters, setFilters] = useState({ status: 'pending', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError('');
    api('/admin/communities', { query: filters })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters]);

  useEffect(load, [load]);

  async function setStatus(community, status) {
    let reason;
    if (status === 'rejected' || status === 'archived') {
      reason = window.prompt(`Reason for ${status === 'rejected' ? 'rejecting' : 'archiving'} “${community.name}”? The creator will see it.`);
      if (reason === null) return;
    }
    setBusyId(community.id);
    try {
      await api(`/admin/communities/${community.id}/status`, { method: 'PATCH', body: { status, reason: reason || undefined } });
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
        <h1>Communities</h1>
      </div>
      <div className="filter-row" role="tablist" aria-label="Community status">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={filters.status === s}
            className={`filter-chip ${filters.status === s ? "is-on" : ""}`}
            onClick={() => setFilters({ status: s, page: 1 })}
          >
            {COMMUNITY_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {!data ? (
        !error && <p className="muted">Loading…</p>
      ) : data.communities.length === 0 ? (
        <p className="empty">{filters.status === 'pending' ? 'No communities are waiting for approval.' : 'None here.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">Community</th>
                <th scope="col">Created by</th>
                <th scope="col">Members</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.communities.map((c) => {
                const busy = busyId === c.id;
                return (
                  <tr key={c.id}>
                    <td data-label="Community" className="post-cell">
                      <div className="cell-primary">
                        <Link to={`/c/${c.slug}`}>{c.name}</Link>
                      </div>
                      <div className="cell-secondary">
                        {CATEGORY_LABELS[c.category]} · created {timeAgo(c.createdAt)}
                      </div>
                      {c.description && <p className="post-excerpt">{c.description}</p>}
                    </td>
                    <td data-label="Created by">
                      <div className="cell-primary">{c.creator?.name ?? 'Deleted user'}</div>
                      <div className="cell-secondary">{c.creator?.email}</div>
                    </td>
                    <td data-label="Members" className="nowrap">{c.memberCount}</td>
                    <td data-label="Status">
                      <span className={`badge ${STATUS_BADGE[c.status]}`}>{COMMUNITY_STATUS_LABELS[c.status]}</span>
                      {c.statusReason && <div className="cell-secondary">{c.statusReason}</div>}
                      {c.reviewedBy && <div className="cell-secondary">by {c.reviewedBy.name}</div>}
                    </td>
                    <td className="row-actions">
                      {c.status === 'pending' && (
                        <>
                          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus(c, 'active')}>
                            Approve
                          </button>
                          <button type="button" className="btn btn-danger-quiet" disabled={busy} onClick={() => setStatus(c, 'rejected')}>
                            Reject
                          </button>
                        </>
                      )}
                      {c.status === 'active' && (
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStatus(c, 'archived')}>
                          Archive
                        </button>
                      )}
                      {(c.status === 'archived' || c.status === 'rejected') && (
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStatus(c, 'active')}>
                          {c.status === 'archived' ? 'Restore' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ ...filters, page })} />}
    </>
  );
}
