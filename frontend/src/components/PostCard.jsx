import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import Sheet from './Sheet.jsx';
import { ReportSheet } from './ReportButton.jsx';
import { academicLine } from '../lib/profile.js';
import UserName from './VerifiedBadge.jsx';
import { fullDate, timeAgo } from '../lib/time.js';

/** Clicks on these should do their own thing, not open the post. */
const INTERACTIVE = 'a, button, input, textarea, label, dialog, [role="button"]';

/**
 * A post in a feed. Like X, Facebook and Instagram: tapping the post opens it on its
 * own page with the replies; the comment icon opens it with the reply box ready.
 * `detail` renders the larger version used at the top of that page.
 */
export default function PostCard({ post: initial, onRemoved, onChange, showCommunity = true, detail = false }) {
  const navigate = useNavigate();
  const [post, setPost] = useState(initial);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Keep in step with the parent (e.g. reply counts on the post page) and report likes back.
  useEffect(() => setPost(initial), [initial]);
  useEffect(() => {
    if (post !== initial) onChange?.(post);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);

  const href = `/post/${post.id}`;

  function open(e) {
    if (detail || e.defaultPrevented || e.target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return; // selecting text, not tapping
    if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
    else navigate(href);
  }

  async function share() {
    const url = new URL(href, window.location.origin).toString();
    const text = `${post.author.name} on SunuCampus`;
    try {
      if (navigator.share) await navigator.share({ title: text, text: post.content.slice(0, 120), url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Share sheet dismissed; nothing to do.
    }
  }

  async function toggleLike() {
    const liked = !post.likedByMe;
    // Optimistic update; roll back if the request fails.
    setPost((p) => ({ ...p, likedByMe: liked, likeCount: p.likeCount + (liked ? 1 : -1) }));
    try {
      const res = await api(`/posts/${post.id}/like`, { method: liked ? 'PUT' : 'DELETE' });
      setPost((p) => ({ ...p, ...res }));
    } catch (err) {
      setPost((p) => ({ ...p, likedByMe: !liked, likeCount: p.likeCount + (liked ? -1 : 1) }));
      setError(err.message);
    }
  }

  async function remove() {
    setMenuOpen(false);
    if (!window.confirm(post.isAuthor ? 'Delete this post?' : 'Remove this post as a moderator?')) return;
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      onRemoved?.(post);
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePin() {
    setMenuOpen(false);
    try {
      const res = await api(`/posts/${post.id}/pin`, { method: 'PATCH', body: { pinned: !post.pinned } });
      setPost(res.post);
    } catch (err) {
      setError(err.message);
    }
  }

  const sub = academicLine(post.author);

  return (
    <article className={`post ${detail ? 'post-detail' : 'post-tappable'}`} onClick={open}>
      <header className="post-header">
        <Link to={`/people/${post.author.id}`} tabIndex={-1} aria-hidden="true">
          <Avatar user={post.author} size={44} />
        </Link>
        <div className="post-meta">
          <p className="post-author">
            <Link to={`/people/${post.author.id}`}><UserName user={post.author} size={17} /></Link>
            {showCommunity && post.community && (
              <span className="post-in">
                {' in '}
                <Link to={`/c/${post.community.slug}`}>{post.community.name}</Link>
              </span>
            )}
          </p>
          <p className="post-sub">
            {detail ? (
              sub
            ) : (
              <>
                <Link to={href} className="post-time">
                  <time dateTime={post.createdAt} title={fullDate(post.createdAt)}>
                    {timeAgo(post.createdAt)}
                  </time>
                </Link>
                {sub && `, ${sub}`}
              </>
            )}
          </p>
        </div>
        {post.pinned && (
          <span className="post-pinned">
            <Icon name="pin" size={14} /> Pinned
          </span>
        )}
        <button type="button" className="icon-button" aria-label="Post options" onClick={() => setMenuOpen(true)}>
          <Icon name="more" />
        </button>
      </header>

      <p className="post-content">{post.content}</p>

      {detail && (
        <>
          <p className="post-when">
            <time dateTime={post.createdAt}>{fullDate(post.createdAt)}</time>
          </p>
          {(post.likeCount > 0 || post.commentCount > 0) && (
            <p className="post-counts">
              {post.likeCount > 0 && (
                <span>
                  <strong>{post.likeCount}</strong> {post.likeCount === 1 ? 'like' : 'likes'}
                </span>
              )}
              {post.commentCount > 0 && (
                <span>
                  <strong>{post.commentCount}</strong> {post.commentCount === 1 ? 'reply' : 'replies'}
                </span>
              )}
            </p>
          )}
        </>
      )}

      <footer className="post-actions">
        <button type="button" className={`action-button ${post.likedByMe ? 'is-liked' : ''}`} aria-pressed={post.likedByMe} onClick={toggleLike}>
          <Icon name="heart" size={22} />
          {post.likeCount > 0 && !detail ? post.likeCount : <span className="visually-hidden">Like</span>}
        </button>
        {detail ? (
          <button type="button" className="action-button" onClick={() => document.getElementById('pd-reply')?.focus()}>
            <Icon name="comment" size={22} />
            <span className="visually-hidden">Reply</span>
          </button>
        ) : (
          <Link to={`${href}?reply=1`} className="action-button" aria-label={`Reply, ${post.commentCount} replies`}>
            <Icon name="comment" size={22} />
            {post.commentCount > 0 && post.commentCount}
          </Link>
        )}
        <button type="button" className="action-button action-share" onClick={share}>
          <Icon name="share" size={22} />
          <span className={copied ? 'action-note' : 'visually-hidden'}>{copied ? 'Link copied' : 'Share'}</span>
        </button>
      </footer>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Post options">
        <div className="group">
          <Link to={`/people/${post.author.id}`} className="group-row">
            <span className="group-row-icon">
              <Icon name="user" size={20} />
            </span>
            <span className="group-row-text">
              <strong>View {post.author.name}’s profile</strong>
            </span>
          </Link>
          {post.canPin && (
            <button type="button" className="group-row" onClick={togglePin}>
              <span className="group-row-icon">
                <Icon name="pin" size={20} />
              </span>
              <span className="group-row-text">
                <strong>{post.pinned ? 'Unpin from community' : 'Pin to top of community'}</strong>
              </span>
            </button>
          )}
          {post.canDelete && (
            <button type="button" className="group-row group-row-danger" onClick={remove}>
              <span className="group-row-icon">
                <Icon name="close" size={20} />
              </span>
              <span className="group-row-text">
                <strong>{post.isAuthor ? 'Delete post' : 'Remove post as moderator'}</strong>
              </span>
            </button>
          )}
          {!post.isAuthor && (
            <button
              type="button"
              className="group-row group-row-danger"
              onClick={() => {
                setMenuOpen(false);
                setReporting(true);
              }}
            >
              <span className="group-row-icon">
                <Icon name="flag" size={20} />
              </span>
              <span className="group-row-text">
                <strong>Report post</strong>
                <span>Admins review every report</span>
              </span>
            </button>
          )}
        </div>
      </Sheet>
      <ReportSheet open={reporting} onClose={() => setReporting(false)} targetType="post" targetId={post.id} />
    </article>
  );
}
