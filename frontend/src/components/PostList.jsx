import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import PostCard from './PostCard.jsx';

/**
 * Loads posts from GET /posts with the given query, with "Load more" paging.
 * Pass `prepend` (a newly created post) to show it at the top immediately.
 */
export default function PostList({ query = {}, prepend, emptyText = 'No posts yet.', showCommunity = true }) {
  const [posts, setPosts] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const snapshot = useRef();
  const key = JSON.stringify(query);

  const load = useCallback(
    async (nextPage) => {
      const data = await api('/posts', { query: { ...JSON.parse(key), page: nextPage, limit: 15, snapshot: nextPage > 1 ? snapshot.current : undefined } });
      snapshot.current = data.snapshot;
      setTotalPages(data.totalPages);
      setPage(nextPage);
      return data.posts;
    },
    [key],
  );

  useEffect(() => {
    setPosts(null);
    setError('');
    snapshot.current = undefined;
    load(1)
      .then(setPosts)
      .catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (prepend) setPosts((p) => (p && !p.some((x) => x.id === prepend.id) ? [prepend, ...p] : p));
  }, [prepend]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const more = await load(page + 1);
      // Skip duplicates that shift between pages when new posts arrive.
      setPosts((p) => [...p, ...more.filter((m) => !p.some((x) => x.id === m.id))]);
    } catch (err) {
      if (err.status === 409) {
        try {
          setPosts(await load(1));
        } catch (refreshError) {
          setError(refreshError.message);
        }
      } else setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && !posts) {
    return (
      <div className="alert alert-error" role="alert" style={{ margin: '0 1rem' }}>
        {error}
      </div>
    );
  }
  if (!posts) return <p className="muted" style={{ padding: '0 1rem' }}>Loading posts…</p>;
  if (posts.length === 0 && page >= totalPages) {
    return (
      <p className="empty" style={{ margin: '0 1rem' }}>
        {emptyText}
      </p>
    );
  }

  return (
    <div className="post-list">
      {error && <p className="field-error" role="alert">{error}</p>}
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          showCommunity={showCommunity}
          canDismiss={query.rank === 'relevant' || query.rank === 'trending'}
          onRemoved={(removed) => setPosts((list) => list.filter((x) => x.id !== removed.id))}
        />
      ))}
      {page < totalPages && (
        <div style={{ padding: '0.5rem 1rem' }}>
          <button type="button" className="btn btn-ghost btn-block" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'Loading…' : 'Load more posts'}
          </button>
        </div>
      )}
    </div>
  );
}
