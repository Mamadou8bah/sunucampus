import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { RoleBadge, StatusBadge, ROLE_LABELS, STATUS_LABELS } from '../../components/Badges.jsx';
import UserName from '../../components/VerifiedBadge.jsx';
import Pagination from '../../components/Pagination.jsx';
import Select from '../../components/Select.jsx';
import WarnSheet from './WarnSheet.jsx';

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [filters, setFilters] = useState({ q: '', role: '', status: '', page: 1 });
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [warning, setWarning] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api('/admin/users', { query: { ...filters, limit: 20 } }));
    } catch (err) {
      setError(err.message);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce typing in the search box.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);


  async function change(target, field, value) {
    let reason;
    if (field === 'status' && value !== 'active') {
      reason = window.prompt(`Reason for marking ${target.name} as ${value}? It is shown to them when they try to log in.`);
      if (reason === null) return;
    }
    setBusyId(target.id);
    setError('');
    setNotice('');
    try {
      await api(`/admin/users/${target.id}/${field}`, { method: 'PATCH', body: { [field]: value, reason: reason || undefined } });
      const label = field === 'role' ? ROLE_LABELS[value] : STATUS_LABELS[value];
      setNotice(`${target.name} is now ${label.toLowerCase()}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        {data && <p className="muted">{data.total} total</p>}
      </div>

      <div className="toolbar" role="search">
        <input
          type="search"
          placeholder="Search name, email or programme"
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="Role"
          variant="pill"
          value={filters.role}
          onChange={(v) => setFilters({ ...filters, role: v, page: 1 })}
          options={[['', 'All roles'], ...Object.entries(ROLE_LABELS)]}
        />
        <Select
          label="Status"
          variant="pill"
          value={filters.status}
          onChange={(v) => setFilters({ ...filters, status: v, page: 1 })}
          options={[['', 'All statuses'], ...Object.entries(STATUS_LABELS)]}
        />
      </div>

      <div aria-live="polite">
        {notice && <div className="alert alert-success">{notice}</div>}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {!data ? (
        !error && <p className="muted">Loading users…</p>
      ) : data.users.length === 0 ? (
        <p className="empty">No users match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Joined</th>
                <th scope="col">Last active</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const isMe = u.id === me.id;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id}>
                    <td data-label="Name">
                      <div className="cell-primary">
                        <UserName user={u} size={15} />
                        {isMe && <span className="muted"> (you)</span>}
                      </div>
                      <div className="cell-secondary">{u.email}</div>
                    </td>
                    <td data-label="Role">
                      <RoleBadge role={u.role} />
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={u.status} />
                      {u.statusReason && <div className="cell-secondary">{u.statusReason}</div>}
                      {u.warningCount > 0 && (
                        <div className="cell-secondary">
                          {u.warningCount} {u.warningCount === 1 ? 'warning' : 'warnings'}
                        </div>
                      )}
                    </td>
                    <td data-label="Joined" className="nowrap">{formatDate(u.createdAt)}</td>
                    <td data-label="Last active" className="nowrap">{formatDate(u.lastActiveAt)}</td>
                    <td className="row-actions">
                      <Select
                        label={`Role for ${u.name}`}
                        variant="pill"
                        value={u.role}
                        disabled={isMe || busy}
                        onChange={(v) => change(u, 'role', v)}
                        options={Object.entries(ROLE_LABELS)}
                      />
                      {u.role !== 'admin' && u.status === 'active' && (
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setWarning(u)}>
                          Warn
                        </button>
                      )}
                      {u.status === 'active' ? (
                        <button
                          type="button"
                          className="btn btn-danger-quiet"
                          disabled={isMe || busy}
                          onClick={() => change(u, 'status', 'suspended')}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => change(u, 'status', 'active')}>
                          Reactivate
                        </button>
                      )}
                      {u.status !== 'banned' && (
                        <button
                          type="button"
                          className="btn btn-danger-quiet"
                          disabled={isMe || busy}
                          onClick={() => change(u, 'status', 'banned')}
                        >
                          Ban
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

      <WarnSheet
        open={Boolean(warning)}
        onClose={() => setWarning(null)}
        user={warning}
        targetType="user"
        targetId={warning?.id}
        onDone={() => {
          setNotice(`Warning sent to ${warning.name}.`);
          load();
        }}
      />
      {data && (
        <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ ...filters, page })} />
      )}
    </>
  );
}
