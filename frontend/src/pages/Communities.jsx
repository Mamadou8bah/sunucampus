import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import AppBar from '../components/AppBar.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import Pagination from '../components/Pagination.jsx';
import Segmented from '../components/Segmented.jsx';
import Sheet from '../components/Sheet.jsx';
import { CATEGORY_LABELS, COMMUNITY_STATUS_LABELS } from '../lib/communities.js';
import Select from '../components/Select.jsx';

export function CommunityMark({ community, size }) {
  return (
    <span className={`community-mark cat-${community.category}`} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      {community.name.charAt(0).toUpperCase()}
    </span>
  );
}

function CommunityTile({ community }) {
  const members = community.memberCount === 1 ? '1 member' : `${community.memberCount} members`;
  const status = community.status !== 'active' ? COMMUNITY_STATUS_LABELS[community.status] : null;
  return (
    <article className="community-tile">
      <CommunityMark community={community} />
      <div className="community-tile-text">
        <h3>
          <Link to={`/c/${community.slug}`}>{community.name}</Link>
        </h3>
        <p>
          {CATEGORY_LABELS[community.category]}, {members}
          {status && `. ${status}`}
        </p>
      </div>
      {community.isMember && community.status === 'active' && <span className="badge badge-status-active community-tile-side">Joined</span>}
    </article>
  );
}

function CreateCommunity({ open, onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', category: '', description: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onInput = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const { community } = await api('/communities', { method: 'POST', body: form });
      onClose();
      navigate(`/c/${community.slug}`);
    } catch (err) {
      const byField = err.fieldErrors?.() ?? {};
      setFieldErrors(byField);
      if (!Object.keys(byField).length) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Create a community"
      footer={
        <button type="submit" form="create-community" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit for approval'}
        </button>
      }
    >
      <form id="create-community" onSubmit={submit} noValidate>
        <p className="muted">An administrator reviews new communities before other students can see them.</p>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <Field label="Name" name="name" value={form.name} onChange={onInput} error={fieldErrors.name} maxLength={60} required />
        <div className="field">
          <label htmlFor="category">Category</label>
          <Select
            id="category"
            label="Category"
            placeholder="Choose a category"
            value={form.category}
            invalid={Boolean(fieldErrors.category)}
            onChange={(v) => setForm({ ...form, category: v })}
            options={Object.entries(CATEGORY_LABELS)}
          />
          {fieldErrors.category && <p className="field-error">Choose a category</p>}
        </div>
        <div className="field">
          <label htmlFor="description">What is it about?</label>
          <textarea id="description" name="description" rows={3} maxLength={1000} value={form.description} onChange={onInput} />
        </div>
      </form>
    </Sheet>
  );
}

export default function Communities() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'all';
  const [filters, setFilters] = useState({ q: '', category: '', page: 1 });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api('/communities', { query: { ...filters, mine: tab === 'mine' ? 'true' : undefined, limit: 20 } })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters, tab]);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <>
      <AppBar
        large
        title="Communities"
        actions={
          <button type="button" className="icon-button" aria-label="Create a community" onClick={() => setCreating(true)}>
            <Icon name="plus" />
          </button>
        }
      >
        <Segmented
          label="Which communities"
          value={tab}
          onChange={(v) => {
            setParams(v === 'mine' ? { tab: 'mine' } : {}, { replace: true });
            setFilters((f) => ({ ...f, page: 1 }));
          }}
          options={[
            ['all', 'Explore'],
            ['mine', 'Joined'],
          ]}
        />
      </AppBar>

      <div className="screen">
        <div className="search-bar" role="search">
          <Icon name="search" size={20} />
          <input type="search" placeholder="Search communities" aria-label="Search communities" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="filter-row" aria-label="Categories">
          <button type="button" className={`filter-chip ${!filters.category ? 'is-on' : ''}`} onClick={() => setFilters({ ...filters, category: '', page: 1 })}>
            All
          </button>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={`filter-chip ${filters.category === v ? 'is-on' : ''}`}
              onClick={() => setFilters({ ...filters, category: filters.category === v ? '' : v, page: 1 })}
            >
              {l}
            </button>
          ))}
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        {!data ? (
          !error && <p className="muted">Loading communities…</p>
        ) : data.communities.length === 0 ? (
          <div className="empty">
            <p>{tab === 'mine' ? 'You haven’t joined any communities yet.' : 'No communities match.'}</p>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Create a community
            </button>
          </div>
        ) : (
          <div className="community-list">
            {data.communities.map((c) => (
              <CommunityTile key={c.id} community={c} />
            ))}
          </div>
        )}

        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => setFilters({ ...filters, page })} />}
      </div>

      <CreateCommunity open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
