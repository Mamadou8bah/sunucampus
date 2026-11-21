import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.js';
import Pagination from '../../components/Pagination.jsx';
import { ACTION_LABELS } from './auditText.js';
import { fullDate, timeAgo } from '../../lib/time.js';
import Select from '../../components/Select.jsx';

const REASON_LABELS = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate content',
  misinformation: 'False information',
  impersonation: 'Impersonation',
  other: 'Other',
};
const TYPE_LABELS = { post: 'Post', comment: 'Comment', community: 'Community', user: 'Profile', listing: 'Listing' };

/** Actions that make sense for each kind of reported item. */
const ACTIONS_FOR = {
  post: ['content_hidden', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'],
  comment: ['content_hidden', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'],
  community: ['community_archived', 'user_warned', 'user_suspended', 'user_banned'],
  user: ['user_warned', 'user_suspended', 'user_banned'],
  listing: ['content_hidden', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'],
};

function TargetPreview({ report }) {
  const t = report.target;
  if (!t) return <p className="muted">This item no longer exists.</p>;
  const link =
    report.targetType === 'post' ? (
      t.community ? `/c/${t.community.slug}` : null
    ) : report.targetType === 'community' ? (
      `/c/${t.slug}`
    ) : report.targetType === 'listing' ? (
      `/market/${t.id}`
    ) : report.targetType === 'user' ? (
      `/people/${t.id}`
    ) : null;

  return (
    <div className="report-target">
      <p className="report-target-meta">
        {TYPE_LABELS[report.targetType]}
        {t.author && (
          <>
            {' by '}
            <strong>{t.author.name}</strong> <span className="muted">({t.author.email})</span>
          </>
        )}
        {t.status && !['visible', 'active'].includes(t.status) && <span className="badge">{t.status}</span>}
      </p>
      {t.name && <p className="report-target-title">{t.name}</p>}
      {(t.content ?? t.description ?? t.bio) && <blockquote>{t.content ?? t.description ?? t.bio}</blockquote>}
      {link && (
        <Link to={link} className="small-link">
          Open in app
        </Link>
      )}
    </div>
  );
}

function ResolveForm({ report, onDone }) {
  const [action, setAction] = useState('none');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(status) {
    const destructive = ['user_suspended', 'user_banned', 'content_removed'].includes(action);
    if (status === 'resolved' && destructive && !window.confirm(`Confirm: ${ACTION_LABELS[action]}?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/reports/${report.id}`, {
        method: 'PATCH',
        body: { status, action: status === 'dismissed' ? 'none' : action, note: note || undefined },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="resolve-form">
      <div className="field">
        <label htmlFor={`action-${report.id}`}>Action</label>
        <Select
          id={`action-${report.id}`}
          label="Action"
          value={action}
          onChange={setAction}
          options={[['none', 'No action needed'], ...ACTIONS_FOR[report.targetType].map((a) => [a, ACTION_LABELS[a][0].toUpperCase() + ACTION_LABELS[a].slice(1)])]}
        />
      </div>
      <div className="field">
        <label htmlFor={`note-${report.id}`}>{action === 'user_warned' ? 'Warning message (optional, a standard message is sent if empty)' : 'Note (optional, shown to a suspended user)'}</label>
        <input id={`note-${report.id}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => submit('dismissed')}>
          Dismiss
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submit('resolved')}>
          Resolve
        </button>
      </div>
    </div>
  );
}

export default function AdminReports() {
  const [filters, setFilters] = useState({ status: 'open', targetType: '', page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api('/admin/reports', { query: filters })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters]);

  useEffect(load, [load]);


  return (
    <>
      <div className="page-header">
        <h1>Reports queue</h1>
        {data && <p className="muted">{data.total} {filters.status || 'total'}</p>}
      </div>

      <div className="toolbar">
        <Select
          label="Status"
          variant="pill"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v, page: 1 })}
          options={[
            ['open', 'Open'],
            ['resolved', 'Resolved'],
            ['dismissed', 'Dismissed'],
            ['', 'All'],
          ]}
        />
        <Select
          label="Content type"
          variant="pill"
          value={filters.targetType}
          onChange={(v) => setFilters({ ...filters, targetType: v, page: 1 })}
          options={[['', 'All content types'], ...Object.entries(TYPE_LABELS).map(([v, l]) => [v, `${l}s`])]}
        />
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {!data ? (
        !error && <p className="muted">Loading reports…</p>
      ) : data.reports.length === 0 ? (
        <p className="empty">{filters.status === 'open' ? 'Nothing to review. The queue is clear.' : 'No reports match.'}</p>
      ) : (
        <div className="report-list">
          {data.reports.map((r) => (
            <article key={r.id} className="card report-card">
              <header className="report-header">
                <div>
                  <span className="badge badge-status-suspended">{REASON_LABELS[r.reason]}</span>
                  {r.openReportsOnTarget > 1 && r.status === 'open' && (
                    <span className="badge">{r.openReportsOnTarget} open reports on this item</span>
                  )}
                </div>
                <time className="muted" title={fullDate(r.createdAt)}>
                  Reported {timeAgo(r.createdAt)} by {r.reporter?.name ?? 'a deleted user'}
                </time>
              </header>
              {r.details && <p className="report-details">“{r.details}”</p>}
              <TargetPreview report={r} />
              {r.status === 'open' ? (
                <ResolveForm report={r} onDone={load} />
              ) : (
                <p className="muted report-outcome">
                  {r.status === 'dismissed' ? 'Dismissed' : `Resolved: ${ACTION_LABELS[r.action] ?? 'no action'}`}
                  {r.resolvedBy && ` by ${r.resolvedBy.name}`}
                  {r.resolvedAt && `, ${timeAgo(r.resolvedAt)}`}
                  {r.resolutionNote && ` (“${r.resolutionNote}”)`}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ ...filters, page })} />}
    </>
  );
}
