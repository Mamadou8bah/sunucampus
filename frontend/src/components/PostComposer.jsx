import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from './Avatar.jsx';
import Sheet from './Sheet.jsx';
import Select from './Select.jsx';

const MAX = 2000;

/**
 * New-post sheet. With `communityId` it posts there; otherwise the student can choose
 * the campus feed or one of their communities.
 */
export default function PostComposer({ open, onClose, communityId, communityName, onPosted }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [target, setTarget] = useState('');
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || communityId) return;
    api('/communities', { query: { mine: 'true', limit: 50 } })
      .then((d) => setMine(d.communities.filter((c) => c.status === 'active')))
      .catch(() => setMine([]));
  }, [open, communityId]);

  async function submit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    setError('');
    try {
      const community = communityId ?? (target || undefined);
      const { post } = await api('/posts', { method: 'POST', body: { content, ...(community && { community }) } });
      setContent('');
      setTarget('');
      onPosted?.(post);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New post"
      footer={
        <div className="composer-footer">
          <span className="muted">{content.length > MAX - 200 ? `${MAX - content.length} characters left` : ''}</span>
          <button type="submit" form="composer-form" className="btn btn-primary" disabled={busy || !content.trim()}>
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      }
    >
      <form id="composer-form" className="composer" onSubmit={submit}>
        <div className="composer-head">
          <Avatar user={user} size={40} />
          {communityId ? (
            <span className="muted">Posting in {communityName}</span>
          ) : (
            <Select
              label="Where to post"
              variant="pill"
              value={target}
              onChange={setTarget}
              options={[['', 'Everyone on campus'], ...mine.map((c) => [c.id, c.name])]}
            />
          )}
        </div>
        <label htmlFor="composer-text" className="visually-hidden">
          Post text
        </label>
        <textarea
          id="composer-text"
          autoFocus
          maxLength={MAX}
          placeholder="Ask a question, share an event, find a teammate…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
