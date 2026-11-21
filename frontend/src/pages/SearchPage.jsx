import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import PostCard from '../components/PostCard.jsx';
import UserName from '../components/VerifiedBadge.jsx';
import { CommunityMark } from './Communities.jsx';
import { CATEGORY_LABELS } from '../lib/communities.js';
import { academicLine } from '../lib/profile.js';
import { clearRecent, readRecent, removeRecent, saveRecent } from '../lib/recentSearches.js';
import { useOptions } from '../lib/useOptions.js';

const TABS = [
  ['all', 'Top'],
  ['people', 'People'],
  ['communities', 'Communities'],
  ['posts', 'Posts'],
];

function PersonRow({ user }) {
  return (
    <li>
      <Link to={`/people/${user.id}`} state={{ source: 'discover' }} className="sr-row">
        <Avatar user={user} size={48} />
        <span className="sr-row-text">
          <strong>
            <UserName user={user} size={15} />
          </strong>
          <span>{academicLine(user) || 'UTG student'}</span>
        </span>
        {user.matchScore > 0 && <span className="score-pill">{user.matchScore}%</span>}
      </Link>
    </li>
  );
}

function CommunityRow({ community }) {
  return (
    <li>
      <Link to={`/c/${community.slug}`} className="sr-row">
        <CommunityMark community={community} size={48} />
        <span className="sr-row-text">
          <strong>{community.name}</strong>
          <span>
            {CATEGORY_LABELS[community.category]}, {community.memberCount === 1 ? '1 member' : `${community.memberCount} members`}
          </span>
        </span>
        {community.isMember && <span className="sr-joined">Joined</span>}
      </Link>
    </li>
  );
}

/** Before typing: recent searches, trending interests and suggested people. */
function StartScreen({ onPick }) {
  const options = useOptions();
  const [recent, setRecent] = useState(readRecent);
  const [suggested, setSuggested] = useState([]);

  useEffect(() => {
    api('/matches', { query: { limit: 6 } })
      .then((d) => setSuggested(d.matches.map((m) => ({ ...m.user, matchScore: m.score }))))
      .catch(() => {});
  }, []);

  return (
    <div className="sr-start">
      {recent.length > 0 && (
        <section>
          <div className="sr-head">
            <h2>Recent</h2>
            <button type="button" className="link-button" onClick={() => setRecent(clearRecent())}>
              Clear all
            </button>
          </div>
          <ul className="sr-recent">
            {recent.map((r) => (
              <li key={r}>
                <button type="button" className="sr-recent-term" onClick={() => onPick(r)}>
                  <Icon name="search" size={18} />
                  {r}
                </button>
                <button type="button" className="icon-button" aria-label={`Remove ${r}`} onClick={() => setRecent(removeRecent(r))}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {options?.interests?.length > 0 && (
        <section>
          <div className="sr-head">
            <h2>Trending on campus</h2>
          </div>
          <div className="sr-trends">
            {options.interests.slice(0, 12).map((i) => (
              <button key={i} type="button" className="sr-trend" onClick={() => onPick(i)}>
                {i}
              </button>
            ))}
          </div>
        </section>
      )}

      {suggested.length > 0 && (
        <section>
          <div className="sr-head">
            <h2>Suggested for you</h2>
            <Link to="/matches">See all</Link>
          </div>
          <ul className="sr-list">
            {suggested.map((u) => (
              <PersonRow key={u.id} user={u} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** General search, like Instagram or X: people, communities and posts. */
export default function SearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tab = TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'all';
  const [draft, setDraft] = useState(q);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => setDraft(q), [q]);

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.trim() !== q) setParams(draft.trim() ? { q: draft.trim(), ...(tab !== 'all' && { tab }) } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (!q) {
      setData(null);
      return;
    }
    setError('');
    setData(null);
    api('/search', { query: { q, type: tab } })
      .then((d) => {
        setData(d);
        if (q.length >= 2) saveRecent(q);
      })
      .catch((err) => setError(err.message));
  }, [q, tab]);

  const pick = (term) => setParams({ q: term }, { replace: true });
  const setTab = (t) => setParams({ q, ...(t !== 'all' && { tab: t }) }, { replace: true });
  const nothing = data && !data.people.length && !data.communities.length && !data.posts.length;

  return (
    <main className="sr">
      <header className="sr-bar">
        <button type="button" className="icon-button sr-back" aria-label="Back" onClick={() => navigate(-1)}>
          <Icon name="back" />
        </button>
        <form
          className="sr-field"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) pick(draft.trim());
            inputRef.current?.blur();
          }}
        >
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            placeholder="Search SunuCampus"
            aria-label="Search people, communities and posts"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus={!q}
          />
          {draft && (
            <button type="button" className="sr-clear" aria-label="Clear search" onClick={() => setDraft('')}>
              <Icon name="close" size={14} strokeWidth={2.4} />
            </button>
          )}
        </form>
      </header>

      {!q ? (
        <StartScreen onPick={pick} />
      ) : (
        <>
          <nav className="pf-tabs sr-tabs" role="tablist" aria-label="Result type">
            {TABS.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : undefined} onClick={() => setTab(value)}>
                {label}
              </button>
            ))}
          </nav>

          {error && <p className="sr-message">{error}</p>}
          {!data && !error && <p className="sr-message">Searching…</p>}
          {nothing && (
            <div className="sr-message">
              <strong>No results for “{q}”</strong>
              <span>Try a name, a programme like Law, or an interest like football.</span>
            </div>
          )}

          {data && !nothing && (
            <div className="sr-results">
              {data.people.length > 0 && (
                <section>
                  {tab === 'all' && (
                    <div className="sr-head">
                      <h2>People</h2>
                      <button type="button" className="link-button" onClick={() => setTab('people')}>
                        See all
                      </button>
                    </div>
                  )}
                  <ul className="sr-list">
                    {data.people.map((u) => (
                      <PersonRow key={u.id} user={u} />
                    ))}
                  </ul>
                </section>
              )}
              {data.communities.length > 0 && (
                <section>
                  {tab === 'all' && (
                    <div className="sr-head">
                      <h2>Communities</h2>
                      <button type="button" className="link-button" onClick={() => setTab('communities')}>
                        See all
                      </button>
                    </div>
                  )}
                  <ul className="sr-list">
                    {data.communities.map((c) => (
                      <CommunityRow key={c.id} community={c} />
                    ))}
                  </ul>
                </section>
              )}
              {data.posts.length > 0 && (
                <section>
                  {tab === 'all' && (
                    <div className="sr-head">
                      <h2>Posts</h2>
                      <button type="button" className="link-button" onClick={() => setTab('posts')}>
                        See all
                      </button>
                    </div>
                  )}
                  <div className="sr-posts">
                    {data.posts.map((p) => (
                      <PostCard key={p.id} post={p} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
