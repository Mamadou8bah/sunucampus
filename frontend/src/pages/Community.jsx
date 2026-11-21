import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api/client.js';
import AppBar from '../components/AppBar.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PostComposer from '../components/PostComposer.jsx';
import PostList from '../components/PostList.jsx';
import Segmented from '../components/Segmented.jsx';
import Sheet from '../components/Sheet.jsx';
import { ReportSheet } from '../components/ReportButton.jsx';
import { CATEGORY_LABELS, COMMUNITY_STATUS_LABELS } from '../lib/communities.js';
import { academicLine } from '../lib/profile.js';
import UserName from '../components/VerifiedBadge.jsx';
import { CommunityMark } from './Communities.jsx';
import Select from '../components/Select.jsx';

function Members({ community, onChange }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/communities/${community.id}/members`)
      .then((d) => setMembers(d.members))
      .catch((err) => setError(err.message));
  }, [community.id]);

  useEffect(load, [load]);

  async function setModerator(member, makeModerator) {
    setError('');
    try {
      if (makeModerator) await api(`/communities/${community.id}/moderators`, { method: 'POST', body: { userId: member.id } });
      else await api(`/communities/${community.id}/moderators/${member.id}`, { method: 'DELETE' });
      load();
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!members) return <div className="screen">{error ? <p className="field-error">{error}</p> : <p className="muted">Loading members…</p>}</div>;

  return (
    <div className="screen">
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <ul className="person-list">
        {members.map((m) => (
          <li key={m.id} className="person-row">
            <Avatar user={m} size={44} />
            <div className="person-row-text">
              <Link to={`/people/${m.id}`}><UserName user={m} size={16} /></Link>
              <span>{m.isModerator ? 'Moderator' : academicLine(m) || 'Member'}</span>
            </div>
            {community.canModerate && (
              <div className="person-row-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModerator(m, !m.isModerator)}>
                  {m.isModerator ? 'Remove moderator' : 'Make moderator'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function About({ community }) {
  return (
    <div className="screen">
      <div className="card">
        <p className="bio" style={{ margin: 0, whiteSpace: 'pre-line' }}>
          {community.description || 'No description yet.'}
        </p>
      </div>
      <h2 className="group-title">Moderators</h2>
      <ul className="person-list">
        {community.moderators.map((m) => (
          <li key={m.id} className="person-row">
            <Avatar user={m} size={40} />
            <div className="person-row-text">
              <Link to={`/people/${m.id}`} className="stretched">
                <UserName user={m} size={16} />
              </Link>
              <span>{academicLine(m)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditCommunity({ community, open, onClose, onSaved }) {
  const [form, setForm] = useState({ description: community.description ?? '', category: community.category });
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await api(`/communities/${community.id}`, { method: 'PATCH', body: form });
      onSaved(res.community);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit community"
      footer={
        <button type="submit" form="edit-community" className="btn btn-primary btn-block">
          Save changes
        </button>
      }
    >
      <form id="edit-community" onSubmit={submit}>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="edit-category">Category</label>
          <Select id="edit-category" label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={Object.entries(CATEGORY_LABELS)} />
        </div>
        <div className="field">
          <label htmlFor="edit-description">Description</label>
          <textarea id="edit-description" rows={5} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </form>
    </Sheet>
  );
}

export default function Community() {
  const { slug } = useParams();
  const [community, setCommunity] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('posts');
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newPost, setNewPost] = useState(null);

  const load = useCallback(() => {
    api(`/communities/${slug}`)
      .then((d) => setCommunity(d.community))
      .catch((err) => setError(err.status === 404 ? 'This community doesn’t exist or isn’t available.' : err.message));
  }, [slug]);

  useEffect(load, [load]);

  async function toggleMembership() {
    setBusy(true);
    setError('');
    try {
      const action = community.isMember ? 'leave' : 'join';
      const res = await api(`/communities/${community.id}/${action}`, { method: 'POST' });
      setCommunity((c) => ({ ...c, ...res.community, moderators: c.moderators }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!community) {
    return error ? (
      <>
        <AppBar title="Community" back />
        <main className="centered-message">
          <h1>{error}</h1>
          <Link to="/communities" className="btn btn-primary">
            Browse communities
          </Link>
        </main>
      </>
    ) : (
      <div className="page-loading">Loading community…</div>
    );
  }

  const isActive = community.status === 'active';
  const members = community.memberCount === 1 ? '1 member' : `${community.memberCount} members`;

  return (
    <>
      <AppBar
        title=""
        back="/communities"
        actions={
          community.canModerate ? (
            <button type="button" className="icon-button" aria-label="Edit community" onClick={() => setEditing(true)}>
              <Icon name="edit" />
            </button>
          ) : (
            <button type="button" className="icon-button" aria-label="Report community" onClick={() => setReporting(true)}>
              <Icon name="flag" />
            </button>
          )
        }
      />

      <section className="community-cover">
        <div className="community-cover-top">
          <CommunityMark community={community} />
          <div>
            <h1>{community.name}</h1>
            <p className="muted">
              {CATEGORY_LABELS[community.category]}, {members}
            </p>
          </div>
        </div>
        {community.status === 'pending' && <div className="alert alert-info">Waiting for an administrator to approve this community.</div>}
        {community.status === 'rejected' && (
          <div className="alert alert-error">This community was not approved{community.statusReason ? `: ${community.statusReason}` : '.'}</div>
        )}
        {community.status === 'archived' && <div className="alert alert-info">{COMMUNITY_STATUS_LABELS.archived}. You can read posts but not add new ones.</div>}
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {isActive && (
          <div className="community-actions">
            <button type="button" className={community.isMember ? 'btn btn-ghost' : 'btn btn-primary'} disabled={busy} onClick={toggleMembership}>
              {community.isMember ? (
                <>
                  <Icon name="check" size={20} /> Joined
                </>
              ) : (
                'Join community'
              )}
            </button>
          </div>
        )}
      </section>

      <div className="community-tabs">
        <Segmented
          label="Community sections"
          value={tab}
          onChange={setTab}
          options={[
            ['posts', 'Posts'],
            ['members', 'Members'],
            ['about', 'About'],
          ]}
        />
      </div>

      {tab === 'posts' && (
        <PostList
          query={{ community: community.id }}
          prepend={newPost}
          showCommunity={false}
          emptyText={community.isMember ? 'No posts yet. Start the conversation.' : 'No posts yet. Join to post here.'}
        />
      )}
      {tab === 'members' && <Members community={community} onChange={load} />}
      {tab === 'about' && <About community={community} />}

      {isActive && community.isMember && tab === 'posts' && (
        <button type="button" className="fab" onClick={() => setComposing(true)} aria-label={`New post in ${community.name}`}>
          <Icon name="plus" size={28} strokeWidth={2.2} />
        </button>
      )}
      <PostComposer
        open={composing}
        onClose={() => setComposing(false)}
        communityId={community.id}
        communityName={community.name}
        onPosted={setNewPost}
      />
      {community.canModerate && (
        <EditCommunity
          community={community}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={(c) => setCommunity((prev) => ({ ...prev, ...c, moderators: prev.moderators }))}
        />
      )}
      <ReportSheet open={reporting} onClose={() => setReporting(false)} targetType="community" targetId={community.id} />
    </>
  );
}
