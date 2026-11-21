import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api, STATIC_DEMO } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { RoleBadge } from '../components/Badges.jsx';
import ConnectButton from '../components/ConnectButton.jsx';
import Icon from '../components/Icon.jsx';
import PostList from '../components/PostList.jsx';
import Sheet from '../components/Sheet.jsx';
import { ReportSheet } from '../components/ReportButton.jsx';
import UserName, { VerifiedBadge } from '../components/VerifiedBadge.jsx';
import { GOAL_LABELS, academicLine, firstName, isProfileComplete } from '../lib/profile.js';

/** A tappable row in a settings sheet. */
function SheetRow({ to, onClick, icon, label, hint, count, danger }) {
  const content = (
    <>
      <span className="sheet-row-icon">{icon}</span>
      <span className="sheet-row-text">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </span>
      {count > 0 && <span className="row-count">{count}</span>}
      {!danger && <Icon name="forward" size={18} className="sheet-row-chevron" />}
    </>
  );
  const className = `sheet-row ${danger ? 'is-danger' : ''}`;
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}

function Stat({ value, label, to }) {
  const body = (
    <>
      <strong>{value}</strong>
      <span>{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className="pf-stat">
      {body}
    </Link>
  ) : (
    <div className="pf-stat">{body}</div>
  );
}

/** /profile (your own) or /people/:id (someone else). */
export default function Profile() {
  const { id } = useParams();
  const { user: me, logout, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isSelf = !id || id === me.id;
  const userId = isSelf ? me.id : id;
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [requests, setRequests] = useState(0);
  const [tab, setTab] = useState('about');
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    setState({ loading: true, error: '', data: null });
    api(`/users/${userId}`)
      .then((data) => setState({ loading: false, error: '', data }))
      .catch((err) => setState({ loading: false, error: err.status === 404 ? 'This profile isn’t available.' : err.message, data: null }));
    if (isSelf) {
      api('/connections/requests')
        .then((d) => setRequests(d.incoming.length))
        .catch(() => {});
    }
  }, [userId, isSelf, me]);

  if (state.loading) return <div className="page-loading">Loading profile…</div>;
  if (state.error) {
    return (
      <main className="pf">
        <header className="pf-bar">
          <button type="button" className="icon-button" aria-label="Back" onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
        </header>
        <div className="centered-message">
          <h1>{state.error}</h1>
          <Link to="/matches" className="btn btn-primary">
            Back to matches
          </Link>
        </div>
      </main>
    );
  }

  const { stats, match, relation } = state.data;
  const user = isSelf ? me : state.data.user;
  const shared = new Set([...(match?.shared?.interests ?? []), ...(match?.shared?.skills ?? [])]);
  const hasAbout = user.prompts?.length || user.goals?.length || user.interests?.length || user.skills?.length;

  return (
    <main className="pf">
      <header className="pf-bar">
        {isSelf ? (
          <span className="pf-bar-spacer" />
        ) : (
          <button type="button" className="icon-button" aria-label="Back" onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
        )}
        <h1 className="pf-bar-title">{isSelf ? 'Profile' : firstName(user.name)}</h1>
        <button type="button" className="icon-button pf-bar-action" aria-label={isSelf ? 'Settings' : 'More options'} onClick={() => setMenuOpen(true)}>
          <Icon name={isSelf ? 'settings' : 'more'} />
          {isSelf && requests > 0 && <span className="pf-dot" aria-hidden="true" />}
        </button>
      </header>

      <section className="pf-head">
        <div className="pf-top">
          <div className={`pf-avatar ${match ? 'has-score' : ''}`} style={match ? { '--score': match.score } : undefined}>
            <Avatar user={user} size={88} />
          </div>
          <div className="pf-stats">
            <Stat value={stats.connections} label="connections" to={isSelf ? '/network' : undefined} />
            <Stat value={stats.posts} label="posts" />
            <Stat value={stats.communities} label="communities" />
          </div>
        </div>

        <h2 className="pf-name">
          <UserName user={user} size={19} />
          {user.role !== 'student' && <RoleBadge role={user.role} />}
        </h2>
        <p className="pf-meta">{academicLine(user) || (isSelf ? 'Add your programme and year' : 'Programme not set')}</p>
        {user.bio && <p className="pf-bio">{user.bio}</p>}

        <div className="pf-actions">
          {isSelf ? (
            <>
              <Link to="/profile/edit" className="pf-btn">
                Edit profile
              </Link>
              <Link to="/network" className="pf-btn">
                Connections{requests > 0 ? ` (${requests})` : ''}
              </Link>
            </>
          ) : (
            relation && (
              <ConnectButton
                userId={user.id}
                relation={relation}
                source={location.state?.source}
                onChange={(next) => setState((s) => ({ ...s, data: { ...s.data, relation: next } }))}
              />
            )
          )}
        </div>

        {isSelf && !user.isVerified && (
          <Link to="/profile/verify" className="pf-nudge">
            <VerifiedBadge size={22} />
            <span>
              <strong>Get your blue tick</strong>
              Verify your UTG email
            </span>
            <Icon name="forward" size={18} />
          </Link>
        )}
        {isSelf && !isProfileComplete(user) && (
          <Link to="/welcome" className="pf-nudge">
            <Icon name="sparkles" size={22} />
            <span>
              <strong>Finish your profile</strong>
              Add goals and interests to get matches
            </span>
            <Icon name="forward" size={18} />
          </Link>
        )}
      </section>

      {match?.reasons.length > 0 && (
        <section className="pf-match" aria-label="Why you might click">
          <p className="pf-match-score">
            <strong>{match.score}%</strong> match
          </p>
          <ul>
            {match.reasons.map((r) => (
              <li key={r}>
                <Icon name="check" size={16} strokeWidth={2.6} />
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="pf-tabs" role="tablist" aria-label="Profile sections">
        {[
          ['about', 'About'],
          ['posts', 'Posts'],
        ].map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : undefined} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'about' ? (
        <div className="pf-about">
          {!hasAbout && <p className="pf-empty">{isSelf ? 'Add prompts, goals and interests so people know what you’re about.' : 'Nothing here yet.'}</p>}

          {user.prompts?.map((p) => (
            <section key={p.question} className="pf-prompt">
              <p className="pf-prompt-q">{p.question}</p>
              <p className="pf-prompt-a">{p.answer}</p>
            </section>
          ))}

          {user.goals?.length > 0 && (
            <section className="pf-section">
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

          {user.interests?.length > 0 && (
            <section className="pf-section">
              <h3>Interests</h3>
              <ul className="chips">
                {user.interests.map((t) => (
                  <li key={t} className={`chip ${shared.has(t) ? 'chip-shared' : ''}`}>
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {user.skills?.length > 0 && (
            <section className="pf-section">
              <h3>Skills</h3>
              <ul className="chips">
                {user.skills.map((t) => (
                  <li key={t} className={`chip ${shared.has(t) ? 'chip-shared' : ''}`}>
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="pf-posts">
          <PostList query={{ author: user.id }} emptyText={isSelf ? 'You haven’t posted yet.' : 'No posts yet.'} />
        </div>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={isSelf ? 'Settings' : user.name}>
        <div className="sheet-list">
          {isSelf ? (
            <>
              {!user.isVerified && <SheetRow to="/profile/verify" icon={<VerifiedBadge size={20} />} label="Get verified" hint="Confirm your UTG email for the blue tick" />}
              <SheetRow to="/profile/edit" icon={<Icon name="edit" size={20} />} label="Edit profile" />
              <SheetRow to="/network" icon={<Icon name="people" size={20} />} label="Connections and requests" count={requests} />
              <SheetRow to="/communities?tab=mine" icon={<Icon name="communities" size={20} />} label="My communities" />
              {hasRole('admin') && <SheetRow to="/admin" icon={<Icon name="shield" size={20} />} label="Admin dashboard" hint="Users, reports, moderation and statistics" />}
              {STATIC_DEMO && (
                <SheetRow
                  onClick={async () => {
                    if (!window.confirm('Reset the demo? Your posts, messages and changes in this browser will be cleared.')) return;
                    (await import('../demo/core.js')).resetDemo();
                  }}
                  icon={<Icon name="sparkles" size={20} />}
                  label="Reset demo data"
                  hint="Start again from the original demo"
                />
              )}
              <SheetRow onClick={logout} icon={<Icon name="logout" size={20} />} label="Log out" danger />
            </>
          ) : (
            <SheetRow
              onClick={() => {
                setMenuOpen(false);
                setReporting(true);
              }}
              icon={<Icon name="flag" size={20} />}
              label="Report profile"
              hint="Admins review every report"
              danger
            />
          )}
        </div>
      </Sheet>
      {!isSelf && <ReportSheet open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={user.id} />}
    </main>
  );
}
