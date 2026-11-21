import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PostCard from '../components/PostCard.jsx';
import { ReportSheet } from '../components/ReportButton.jsx';
import UserName from '../components/VerifiedBadge.jsx';
import { firstName } from '../lib/profile.js';
import { fullDate, timeAgo } from '../lib/time.js';

/** A single post with its replies, like opening a post on X or Facebook. */
export default function PostDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(null);
  const inputRef = useRef(null);
  const listEnd = useRef(null);

  useEffect(() => {
    setPost(null);
    setComments(null);
    Promise.all([api(`/posts/${id}`), api(`/posts/${id}/comments`)])
      .then(([p, c]) => {
        setPost(p.post);
        setComments(c.comments);
      })
      .catch((err) => setError(err.status === 404 ? 'This post isn’t available any more.' : err.message));
  }, [id]);

  // Coming from the comment button: open with the reply box ready.
  useEffect(() => {
    if (post && params.get('reply')) inputRef.current?.focus();
  }, [post, params]);

  async function reply(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { comment } = await api(`/posts/${id}/comments`, { method: 'POST', body: { content: draft } });
      setComments((c) => [...c, comment]);
      setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
      setDraft('');
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(comment) {
    if (!window.confirm('Delete this reply?')) return;
    try {
      await api(`/posts/${id}/comments/${comment.id}`, { method: 'DELETE' });
      setComments((c) => c.filter((x) => x.id !== comment.id));
      setPost((p) => ({ ...p, commentCount: p.commentCount - 1 }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="pd">
      <header className="pd-bar">
        <button type="button" className="icon-button" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <Icon name="back" />
        </button>
        <h1>Post</h1>
        <span style={{ width: 44 }} />
      </header>

      {!post ? (
        <p className="sr-message">{error || 'Loading…'}</p>
      ) : (
        <>
          <PostCard post={post} detail onRemoved={() => navigate(-1)} onChange={setPost} />

          <section className="pd-replies" aria-label="Replies">
            {comments.length === 0 ? (
              <p className="pd-empty">No replies yet. Start the conversation.</p>
            ) : (
              <ul>
                {comments.map((c) => (
                  <li key={c.id} className="pd-reply">
                    <Link to={`/people/${c.author.id}`} aria-hidden="true" tabIndex={-1}>
                      <Avatar user={c.author} size={40} />
                    </Link>
                    <div className="pd-reply-body">
                      <p className="pd-reply-head">
                        <Link to={`/people/${c.author.id}`}>
                          <UserName user={c.author} size={14} />
                        </Link>
                        <time dateTime={c.createdAt} title={fullDate(c.createdAt)}>
                          {timeAgo(c.createdAt)}
                        </time>
                      </p>
                      <p className="pd-reply-text">{c.content}</p>
                      <div className="pd-reply-actions">
                        {c.canDelete ? (
                          <button type="button" className="link-button link-danger" onClick={() => remove(c)}>
                            Delete
                          </button>
                        ) : (
                          <button type="button" className="link-button" onClick={() => setReporting(c.id)}>
                            Report
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div ref={listEnd} />
          </section>

          <form className="pd-composer" onSubmit={reply}>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <Avatar user={user} size={36} />
            <label htmlFor="pd-reply" className="visually-hidden">
              Reply to {post.author.name}
            </label>
            <textarea
              id="pd-reply"
              ref={inputRef}
              rows={1}
              maxLength={1000}
              placeholder={`Reply to ${firstName(post.author.name)}…`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) reply(e);
              }}
            />
            <button type="submit" className={`pd-send ${draft.trim() ? 'is-ready' : ''}`} disabled={busy || !draft.trim()}>
              Reply
            </button>
          </form>
        </>
      )}
      <ReportSheet open={Boolean(reporting)} onClose={() => setReporting(null)} targetType="comment" targetId={reporting} />
    </main>
  );
}
