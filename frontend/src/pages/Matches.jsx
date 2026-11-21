import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import AppBar from '../components/AppBar.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import Pagination from '../components/Pagination.jsx';
import Segmented from '../components/Segmented.jsx';
import Sheet from '../components/Sheet.jsx';
import Select from '../components/Select.jsx';
import { GOAL_LABELS, YEARS, academicLine, firstName } from '../lib/profile.js';
import UserName from '../components/VerifiedBadge.jsx';
import { useOptions } from '../lib/useOptions.js';
import { clearRecent, readRecent, saveRecent } from '../lib/recentSearches.js';

const SWIPE_THRESHOLD = 110;
const PASSED_KEY = 'sunucampus.passed';

const readPassed = () => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(PASSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};

/* ----------------------------- Deck ----------------------------- */

function MatchCard({ match, onSwipe, leaving }) {
  const { user, score, reasons, shared } = match;
  const cardRef = useRef(null);
  const start = useRef(null);
  const [dx, setDx] = useState(0);
  const [returning, setReturning] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  function onPointerDown(e) {
    if (e.target.closest('a, button')) return;
    start.current = e.clientX;
    setReturning(false);
    cardRef.current.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (start.current === null) return;
    setDx(e.clientX - start.current);
  }
  function onPointerUp() {
    if (start.current === null) return;
    start.current = null;
    if (dx > SWIPE_THRESHOLD) onSwipe('connect');
    else if (dx < -SWIPE_THRESHOLD) onSwipe('pass');
    else {
      setReturning(true);
      setDx(0);
    }
  }

  const sharedSet = new Set([...(shared?.interests ?? []), ...(shared?.skills ?? [])]);
  // Shared ones first; the rest stay folded away until the student asks to see them.
  const allTags = [...new Set([...(user.interests ?? []), ...(user.skills ?? [])])].sort((a, b) => sharedSet.has(b) - sharedSet.has(a));
  const COLLAPSED = 5;
  const hidden = Math.max(0, allTags.length - COLLAPSED);
  const tags = showAllTags ? allTags : allTags.slice(0, COLLAPSED);
  const prompt = user.prompts?.[0];
  const leavingClass = leaving ? `is-leaving-${leaving === 'connect' ? 'right' : 'left'}` : '';

  return (
    <article
      ref={cardRef}
      className={`match-card ${leavingClass} ${returning ? 'is-returning' : ''}`}
      style={leaving ? undefined : { transform: `translateX(${dx}px) rotate(${dx / 22}deg)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={`${user.name}, ${score}% match`}
    >
      <span className="match-stamp match-stamp-connect" style={{ opacity: Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD)) }} aria-hidden="true">
        Connect
      </span>
      <span className="match-stamp match-stamp-pass" style={{ opacity: Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD)) }} aria-hidden="true">
        Pass
      </span>

      {user.avatarUrl ? (
        <header className="match-photo">
          <img src={user.avatarUrl} alt="" draggable={false} />
          <span className="match-score-badge" style={{ '--score': score }}>
            <strong>{score}%</strong>
            <span>match</span>
          </span>
          <div className="match-photo-text">
            <h2>
              <UserName user={user} size={24} />
            </h2>
            <p>{academicLine(user) || 'Programme not set'}</p>
          </div>
        </header>
      ) : (
        <header className="match-hero">
          <span className="match-ring" style={{ '--score': score }}>
            <Avatar user={user} size={92} />
          </span>
          <div className="match-hero-text">
            <h2>
              <UserName user={user} size={22} />
            </h2>
            <p>{academicLine(user) || 'Programme not set'}</p>
            <p className="match-percent">
              <strong>{score}%</strong>
              <span>match</span>
            </p>
          </div>
        </header>
      )}

      <div className="match-body">
        {reasons.length > 0 && (
          <section>
            <h3>Why you might click</h3>
            <ul className="match-reasons">
              {reasons.slice(0, 4).map((r) => (
                <li key={r}>
                  <Icon name="check" size={18} strokeWidth={2.4} />
                  {r}
                </li>
              ))}
            </ul>
          </section>
        )}

        {prompt && (
          <div className="prompt-card">
            <p className="prompt-question">{prompt.question}</p>
            <p className="prompt-answer">{prompt.answer}</p>
          </div>
        )}

        {tags.length > 0 && (
          <section>
            <h3>Interests and skills</h3>
            <ul className="chips" id={`tags-${user.id}`}>
              {tags.map((t) => (
                <li key={t} className={`chip ${sharedSet.has(t) ? 'chip-shared' : ''}`}>
                  {t}
                </li>
              ))}
              {hidden > 0 && (
                <li>
                  <button
                    type="button"
                    className="chip-toggle"
                    aria-expanded={showAllTags}
                    aria-controls={`tags-${user.id}`}
                    onClick={() => setShowAllTags((v) => !v)}
                  >
                    {showAllTags ? 'Show less' : `+${hidden} more`}
                  </button>
                </li>
              )}
            </ul>
          </section>
        )}

        {user.goals?.length > 0 && (
          <section>
            <h3>Looking for</h3>
            <ul className="chips">
              {user.goals.map((g) => (
                <li key={g} className="chip chip-goal">
                  {GOAL_LABELS[g]}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

function Deck() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/matches', { query: { limit: 30 } })
      .then((d) => {
        const passed = readPassed();
        setData({ ...d, matches: d.matches.filter((m) => !passed.has(m.user.id)) });
      })
      .catch((err) => setError(err.message));
  }, []);

  const current = data?.matches[index];

  async function decide(action) {
    if (!current || leaving) return;
    setError('');
    if (action === 'connect') {
      try {
        await api('/connections', { method: 'POST', body: { recipientId: current.user.id, source: 'match' } });
        setNotice(`Request sent to ${firstName(current.user.name)}.`);
      } catch (err) {
        setError(err.message);
        return;
      }
    } else {
      const passed = readPassed();
      passed.add(current.user.id);
      sessionStorage.setItem(PASSED_KEY, JSON.stringify([...passed]));
      setNotice('');
    }
    setLeaving(action);
    setTimeout(() => {
      setLeaving(null);
      setIndex((i) => i + 1);
    }, 260);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, dialog')) return;
      if (e.key === 'ArrowRight') decide('connect');
      if (e.key === 'ArrowLeft') decide('pass');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error && !data) {
    return (
      <div className="screen">
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      </div>
    );
  }
  if (!data) return <p className="muted screen">Finding your matches…</p>;

  if (data.profileIncomplete) {
    return (
      <div className="screen">
        <div className="empty">
          <h2>Tell us a little about you</h2>
          <p>Add what you’re looking for and a few interests, and we’ll show students you’re likely to click with.</p>
          <Link to="/welcome" className="btn btn-primary">
            Finish my profile
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="screen">
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <div className="empty">
          <h2>You’re all caught up</h2>
          <p>New matches appear as more students join. Meanwhile, search for anyone on campus.</p>
          <Link to="/matches?tab=search" className="btn btn-primary">
            Search students
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="deck">
        <MatchCard key={current.user.id} match={current} onSwipe={decide} leaving={leaving} />
      </div>
      <div className="deck-actions">
        <button type="button" className="deck-button deck-pass" onClick={() => decide('pass')} aria-label={`Pass on ${current.user.name}`}>
          <Icon name="close" size={28} strokeWidth={2.2} />
        </button>
        <button type="button" className="deck-button deck-connect" onClick={() => decide('connect')} aria-label={`Connect with ${current.user.name}`}>
          <Icon name="people" size={32} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="deck-button deck-view"
          onClick={() => navigate(`/people/${current.user.id}`, { state: { source: 'match' } })}
          aria-label={`View ${current.user.name}’s profile`}
        >
          <Icon name="user" size={26} />
        </button>
      </div>
      <div aria-live="polite">
        {error && <p className="field-error" style={{ textAlign: 'center' }}>{error}</p>}
        <p className="deck-meta">{notice || `${index + 1} of ${data.matches.length}. Swipe right to connect, left to pass.`}</p>
      </div>
    </>
  );
}

/* ----------------------------- Search ----------------------------- */

const FILTER_KEYS = ['q', 'programme', 'year', 'goal', 'interests', 'skills'];

function Search() {
  const options = useOptions();
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? '']));
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState(filters.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const [recent, setRecent] = useState(readRecent);
  const activeFilters = ['programme', 'year', 'goal', 'interests', 'skills'].filter((k) => filters[k]);
  // Only search once the student types something or picks a filter; never list everyone.
  const hasQuery = filters.q.trim().length > 0 || activeFilters.length > 0;

  const query = params.toString();
  useEffect(() => {
    setError('');
    if (!hasQuery) {
      setData(null);
      return;
    }
    const q = Object.fromEntries(new URLSearchParams(query));
    delete q.tab;
    api('/users', { query: { ...q, limit: 20 } })
      .then((d) => {
        setData(d);
        if (filters.q.trim().length >= 2) setRecent(saveRecent(filters.q.trim()));
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hasQuery]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.q) update({ q: search });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="screen">
      <div className="search-bar" role="search">
        <Icon name="search" size={20} />
        <input
          type="search"
          aria-label="Search by name, programme, interest or skill"
          placeholder="Name, programme, interest or skill"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="filter-row">
        <button type="button" className={`filter-chip ${activeFilters.length ? 'is-on' : ''}`} onClick={() => setFiltersOpen(true)}>
          <Icon name="filter" size={18} />
          Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
        </button>
        {Object.entries(GOAL_LABELS).map(([g, label]) => (
          <button key={g} type="button" className={`filter-chip ${filters.goal === g ? 'is-on' : ''}`} onClick={() => update({ goal: filters.goal === g ? '' : g })}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {!hasQuery ? (
        <div className="search-start">
          {recent.length > 0 && (
            <section>
              <div className="search-start-head">
                <h3>Recent</h3>
                <button type="button" className="link-button" onClick={() => setRecent(clearRecent())}>
                  Clear
                </button>
              </div>
              <ul className="recent-list">
                {recent.map((r) => (
                  <li key={r}>
                    <button type="button" className="recent-item" onClick={() => setSearch(r)}>
                      <Icon name="search" size={16} />
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {options?.interests?.length > 0 && (
            <section>
              <h3>Popular interests</h3>
              <div className="suggest-chips">
                {options.interests.slice(0, 10).map((i) => (
                  <button key={i} type="button" className="suggest-chip" onClick={() => update({ interests: i })}>
                    {i}
                  </button>
                ))}
              </div>
            </section>
          )}
          {options?.programmes?.length > 0 && (
            <section>
              <h3>Programmes</h3>
              <div className="suggest-chips">
                {options.programmes.slice(0, 10).map((p) => (
                  <button key={p} type="button" className="suggest-chip" onClick={() => update({ programme: p })}>
                    {p}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : !data ? (
        !error && <p className="muted">Searching…</p>
      ) : data.users.length === 0 ? (
        <p className="empty">No students match. Try fewer filters.</p>
      ) : (
        <>
          <p className="muted" style={{ margin: '0.75rem 0.25rem 0.5rem' }}>
            {data.total === 1 ? '1 student' : `${data.total} students`}
          </p>
          <ul className="person-list">
            {data.users.map((u) => (
              <li key={u.id} className="person-row">
                <Avatar user={u} size={48} />
                <div className="person-row-text">
                  <Link to={`/people/${u.id}`} state={{ source: 'discover' }} className="stretched">
                    <UserName user={u} size={16} />
                  </Link>
                  <span>{academicLine(u) || 'Programme not set'}</span>
                  {u.interests?.length > 0 && <span>{u.interests.slice(0, 3).join(', ')}</span>}
                </div>
                {u.matchScore !== undefined && u.matchScore > 0 && <span className="score-pill">{u.matchScore}%</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {hasQuery && data && <Pagination page={page} totalPages={data.totalPages} onChange={(p) => update({ page: String(p) })} />}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => update({ programme: '', year: '', interests: '', skills: '', goal: '' })}>
              Clear all
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
              Show results
            </button>
          </div>
        }
      >
        <div className="field">
          <label htmlFor="f-programme">Programme</label>
          <Select
            id="f-programme"
            label="Programme"
            value={filters.programme}
            onChange={(v) => update({ programme: v })}
            options={[['', 'Any programme'], ...(options?.programmes ?? []).map((p) => [p, p])]}
          />
        </div>
        <div className="field">
          <label htmlFor="f-year">Year of study</label>
          <Select
            id="f-year"
            label="Year of study"
            value={filters.year}
            onChange={(v) => update({ year: v })}
            options={[['', 'Any year'], ...YEARS.map((y) => [y, `Year ${y}`])]}
          />
        </div>
        <div className="field">
          <label htmlFor="f-interest">Interest</label>
          <Select
            id="f-interest"
            label="Interest"
            value={filters.interests}
            onChange={(v) => update({ interests: v })}
            options={[['', 'Any interest'], ...(options?.interests ?? []).map((i) => [i, i])]}
          />
        </div>
        <div className="field">
          <label htmlFor="f-skill">Skill</label>
          <Select
            id="f-skill"
            label="Skill"
            value={filters.skills}
            onChange={(v) => update({ skills: v })}
            options={[['', 'Any skill'], ...(options?.skills ?? []).map((s) => [s, s])]}
          />
        </div>
      </Sheet>
    </div>
  );
}

export default function Matches() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'search' ? 'search' : 'foryou';

  return (
    <>
      <AppBar large title="Matches">
        <Segmented
          label="Matches view"
          value={tab}
          onChange={(v) => setParams(v === 'search' ? { tab: 'search' } : {}, { replace: true })}
          options={[
            ['foryou', 'For you'],
            ['search', 'Search'],
          ]}
        />
      </AppBar>
      {tab === 'search' ? <Search /> : <Deck />}
    </>
  );
}
