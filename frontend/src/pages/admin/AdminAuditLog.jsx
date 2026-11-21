import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import Pagination from '../../components/Pagination.jsx';
import { describeAction } from './auditText.js';
import { fullDate } from '../../lib/time.js';

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/audit-logs', { query: { page, limit: 25 } })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [page]);

  return (
    <>
      <div className="page-header">
        <h1>Audit log</h1>
        <p className="muted">Every administrative action, newest first.</p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {!data ? (
        !error && <p className="muted">Loading…</p>
      ) : data.logs.length === 0 ? (
        <p className="empty">No administrative actions yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table table-stack">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Admin</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((log) => (
                <tr key={log.id}>
                  <td data-label="When" className="nowrap">{fullDate(log.createdAt)}</td>
                  <td data-label="Admin">{log.actor?.name ?? 'Deleted user'}</td>
                  <td data-label="Action">{describeAction(log)}</td>
                  <td data-label="Target" className="cell-secondary nowrap">
                    {log.targetType} …{log.targetId.slice(-6)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </>
  );
}
