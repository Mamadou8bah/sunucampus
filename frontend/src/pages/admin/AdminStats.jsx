import { useEffect, useMemo, useState } from 'react';
import { api, apiDownload } from '../../api/client.js';
import { BarList, ChartCard, DataTable, LineChart, StatTile } from '../../components/charts/Charts.jsx';
import { GOAL_LABELS } from '../../lib/profile.js';
import { CATEGORY_LABELS, COMMUNITY_STATUS_LABELS } from '../../lib/communities.js';
import { ROLE_LABELS, STATUS_LABELS } from '../../components/Badges.jsx';
import { ACTION_LABELS } from './auditText.js';
import { MARKET_CATEGORIES } from '../../lib/market.js';
import Select from '../../components/Select.jsx';

const PRESETS = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months', custom: 'Custom range' };
const SECTION_NAV = [
  ['users', 'Users'],
  ['engagement', 'Engagement'],
  ['connections', 'Connections'],
  ['communities', 'Communities'],
  ['messaging', 'Messaging'],
  ['moderation', 'Moderation'],
  ['marketplace', 'Marketplace'],
  ['popular', 'Popular interests'],
];

const isoDay = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => isoDay(new Date(Date.now() - (n - 1) * 86_400_000));
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** { key: count } → BarList items with readable labels. */
const toItems = (obj, labels = {}) =>
  Object.entries(obj ?? {})
    .map(([k, v]) => ({ label: labels[k] ?? capital(k), value: v }))
    .sort((a, b) => b.value - a.value);

const seriesRows = (series, keys) => series.map((r) => [r.date, ...keys.map((k) => r[k])]);

function Section({ id, title, children }) {
  return (
    <section id={`stats-${id}`} className="stats-section" aria-labelledby={`stats-${id}-title`}>
      <h2 id={`stats-${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

export default function AdminStats() {
  const [preset, setPreset] = useState('30');
  const [custom, setCustom] = useState({ from: daysAgo(30), to: isoDay(new Date()) });
  const [groupBy, setGroupBy] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => {
    const range = preset === 'custom' ? custom : { from: daysAgo(Number(preset)), to: isoDay(new Date()) };
    return { ...range, interval: groupBy || undefined };
  }, [preset, custom, groupBy]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api('/admin/stats', { query })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  async function exportCsv() {
    setExporting(true);
    try {
      await apiDownload('/admin/stats/export', query);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const iv = data?.range.interval;
  const rangeText = data
    ? `${new Date(data.range.from).toLocaleDateString(undefined, { dateStyle: 'medium' })} – ${new Date(data.range.to).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
    : '';

  return (
    <div className="stats-page">
      <div className="page-header">
        <div>
          <h1>Platform statistics</h1>
          <p className="muted">{rangeText && `Showing ${rangeText}, grouped by ${iv}.`}</p>
        </div>
        <div className="no-print stats-actions">
          <button type="button" className="btn btn-ghost" onClick={() => window.print()} disabled={!data}>
            Print or save as PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={!data || exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="toolbar no-print" aria-label="Report filters">
        <Select label="Date range" variant="pill" value={preset} onChange={setPreset} options={Object.entries(PRESETS)} />
        {preset === 'custom' && (
          <>
            <label className="inline-field">
              From
              <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            </label>
            <label className="inline-field">
              To
              <input type="date" value={custom.to} min={custom.from} max={isoDay(new Date())} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </label>
          </>
        )}
        <Select
          label="Group by"
          variant="pill"
          value={groupBy}
          onChange={setGroupBy}
          options={[
            ['', 'Group automatically'],
            ['day', 'Group by day'],
            ['week', 'Group by week'],
            ['month', 'Group by month'],
          ]}
        />
        {loading && data && <span className="muted">Updating…</span>}
      </div>

      <nav className="stats-nav no-print" aria-label="Report sections">
        {SECTION_NAV.map(([id, label]) => (
          <a key={id} href={`#stats-${id}`}>
            {label}
          </a>
        ))}
      </nav>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <p className="muted">Calculating statistics…</p>}

      {data && (
        <>
          <Section id="users" title="Users">
            <div className="stat-grid">
              <StatTile label="Total users" value={data.users.total} />
              <StatTile label="New in this range" value={data.users.newInRange} />
              <StatTile label="Active today" value={data.users.active.day} hint="Last 24 hours" />
              <StatTile label="Active this week" value={data.users.active.week} hint="Last 7 days" />
              <StatTile label="Active this month" value={data.users.active.month} hint="Last 30 days" />
              <StatTile label="Profiles complete" value={data.users.profileCompletionRate} suffix="%" hint="Ready for matching" />
              <StatTile label="Verified UTG email" value={data.users.verifiedRate} suffix="%" hint={`${data.users.verified} students with the blue tick`} />
            </div>
            <ChartCard
              title="New registrations"
              subtitle={`Accounts created per ${iv}`}
              table={<DataTable columns={['Period starting', 'Registrations']} rows={seriesRows(data.users.registrations, ['count'])} />}
            >
              <LineChart data={data.users.registrations} series={[{ key: 'count', label: 'Registrations' }]} interval={iv} />
            </ChartCard>
            <div className="chart-grid">
              <ChartCard title="Users by programme" subtitle="Top 10">
                <BarList items={data.users.byProgramme.map((r) => ({ label: r.programme, value: r.count }))} />
              </ChartCard>
              <ChartCard title="Users by year of study">
                <BarList items={data.users.byYear.map((r) => ({ label: typeof r.year === 'number' ? `Year ${r.year}` : r.year, value: r.count }))} />
              </ChartCard>
              <ChartCard title="Users by role">
                <BarList items={toItems(data.users.byRole, ROLE_LABELS)} />
              </ChartCard>
              <ChartCard title="Users by account status">
                <BarList items={toItems(data.users.byStatus, STATUS_LABELS)} />
              </ChartCard>
            </div>
          </Section>

          <Section id="engagement" title="Engagement">
            <div className="stat-grid">
              <StatTile label="Posts" value={data.engagement.posts} />
              <StatTile label="Comments" value={data.engagement.comments} />
              <StatTile label="Likes" value={data.engagement.likes} hint="On posts from this range" />
              <StatTile label="Students posting" value={data.engagement.activeAuthors} hint="Posted or commented" />
            </div>
            <ChartCard
              title="Posts and comments"
              subtitle={`Created per ${iv}`}
              table={<DataTable columns={['Period starting', 'Posts', 'Comments']} rows={seriesRows(data.engagement.series, ['posts', 'comments'])} />}
            >
              <LineChart
                data={data.engagement.series}
                series={[
                  { key: 'posts', label: 'Posts' },
                  { key: 'comments', label: 'Comments' },
                ]}
                interval={iv}
              />
            </ChartCard>
            <div className="chart-grid">
              <ChartCard title="Most popular posts" subtitle="By likes, then comments">
                {data.engagement.topPosts.length === 0 ? (
                  <p className="muted chart-empty">No posts in this range.</p>
                ) : (
                  <DataTable columns={['Post', 'Likes', 'Comments']} rows={data.engagement.topPosts.map((p) => [`${p.author}: ${p.excerpt}`, p.likes, p.comments])} />
                )}
              </ChartCard>
              <ChartCard title="Most active students" subtitle="Posts plus comments">
                {data.engagement.mostActiveUsers.length === 0 ? (
                  <p className="muted chart-empty">No activity in this range.</p>
                ) : (
                  <DataTable columns={['Student', 'Posts', 'Comments', 'Total']} rows={data.engagement.mostActiveUsers.map((u) => [u.name, u.posts, u.comments, u.total])} />
                )}
              </ChartCard>
            </div>
          </Section>

          <Section id="connections" title="Connections">
            <div className="stat-grid">
              <StatTile label="Requests sent" value={data.connections.requestsSent} />
              <StatTile label="Accepted" value={data.connections.accepted} />
              <StatTile label="Acceptance rate" value={data.connections.acceptanceRate} suffix="%" hint="Of answered requests" />
              <StatTile label="Connections per student" value={data.connections.averageConnectionsPerUser} hint="Average, all time" />
              <StatTile label="From smart matching" value={data.connections.fromMatchingRate} suffix="%" hint="Of requests sent" />
              <StatTile label="Accepted smart-match requests" value={data.connections.acceptedFromMatching} />
            </div>
            <div className="chart-grid">
              <ChartCard
                title="Connection requests"
                subtitle={`Sent per ${iv}`}
                table={<DataTable columns={['Period starting', 'Requests']} rows={seriesRows(data.connections.series, ['count'])} />}
              >
                <LineChart data={data.connections.series} series={[{ key: 'count', label: 'Requests' }]} interval={iv} height={200} />
              </ChartCard>
              <ChartCard title="How students found each other" subtitle="Where the request was sent from">
                <BarList items={toItems(data.connections.bySource, { match: 'Smart matches', discover: 'Discover search', profile: 'Profile or other' })} />
                <BarList
                  items={[
                    { label: 'Accepted', value: data.connections.accepted },
                    { label: 'Rejected', value: data.connections.rejected },
                    { label: 'Pending', value: data.connections.pending },
                  ]}
                />
              </ChartCard>
            </div>
          </Section>

          <Section id="communities" title="Communities">
            <div className="stat-grid">
              <StatTile label="Communities" value={data.communities.total} />
              <StatTile label="Active" value={data.communities.byStatus.active ?? 0} />
              <StatTile label="Awaiting approval" value={data.communities.byStatus.pending ?? 0} />
              <StatTile label="Created in this range" value={data.communities.createdInRange} />
            </div>
            <div className="chart-grid">
              <ChartCard title="Largest communities" subtitle="By members">
                <BarList items={data.communities.largest.map((c) => ({ label: c.name, value: c.members }))} empty="No active communities yet." />
              </ChartCard>
              <ChartCard title="Most active communities" subtitle="Posts in this range">
                <BarList items={data.communities.mostActive.map((c) => ({ label: c.name, value: c.posts }))} />
              </ChartCard>
              <ChartCard
                title="Fastest-growing communities"
                subtitle="Net membership gains in this range"
                table={<DataTable columns={['Community', 'Net members']} rows={data.communities.fastestGrowing.map((c) => [c.name, c.netMembers])} />}
              >
                <BarList items={data.communities.fastestGrowing.map((c) => ({ label: c.name, value: c.netMembers }))} empty="No recorded membership gains in this range." />
              </ChartCard>
              <ChartCard title="Active communities by category">
                <BarList items={toItems(data.communities.byCategory, CATEGORY_LABELS)} empty="No active communities yet." />
              </ChartCard>
              <ChartCard title="Communities by status">
                <BarList items={toItems(data.communities.byStatus, COMMUNITY_STATUS_LABELS)} empty="No communities yet." />
              </ChartCard>
            </div>
          </Section>

          <Section id="messaging" title="Messaging">
            <p className="muted section-note">Counts only. Administrators cannot read message content.</p>
            <div className="stat-grid">
              <StatTile label="Messages sent" value={data.messaging.messages} />
              <StatTile label="Active conversations" value={data.messaging.activeConversations} />
              <StatTile label="Students messaging" value={data.messaging.activeSenders} />
              <StatTile label="Messages per conversation" value={data.messaging.averagePerConversation} hint="Average, active only" />
            </div>
            <ChartCard
              title="Messages sent"
              subtitle={`Per ${iv}`}
              table={<DataTable columns={['Period starting', 'Messages']} rows={seriesRows(data.messaging.series, ['count'])} />}
            >
              <LineChart data={data.messaging.series} series={[{ key: 'count', label: 'Messages' }]} interval={iv} height={200} />
            </ChartCard>
          </Section>

          <Section id="moderation" title="Moderation">
            <div className="stat-grid">
              <StatTile label="Reports received" value={data.moderation.received} />
              <StatTile label="Resolved" value={data.moderation.resolved} />
              <StatTile label="Dismissed" value={data.moderation.dismissed} />
              <StatTile label="Open now" value={data.moderation.openNow} />
              <StatTile label="Average time to resolve" value={data.moderation.averageResolutionHours} suffix=" h" />
              <StatTile label="Suspended / banned" value={`${data.moderation.suspendedAccounts} / ${data.moderation.bannedAccounts}`} hint="Accounts right now" />
            </div>
            <div className="chart-grid">
              <ChartCard title="Reports by reason">
                <BarList items={toItems(data.moderation.byReason)} empty="No reports in this range." />
              </ChartCard>
              <ChartCard title="Actions taken">
                <BarList items={toItems(data.moderation.actionsTaken, Object.fromEntries(Object.entries(ACTION_LABELS).map(([k, v]) => [k, capital(v)])))} empty="No reports resolved in this range." />
              </ChartCard>
              <ChartCard title="Reports by content type">
                <BarList items={toItems(data.moderation.byTargetType, { post: 'Posts', comment: 'Comments', community: 'Communities', user: 'Profiles' })} empty="No reports in this range." />
              </ChartCard>
              <ChartCard
                title="Reports received"
                subtitle={`Per ${iv}`}
                table={<DataTable columns={['Period starting', 'Reports']} rows={seriesRows(data.moderation.series, ['count'])} />}
              >
                <LineChart data={data.moderation.series} series={[{ key: 'count', label: 'Reports' }]} interval={iv} height={180} />
              </ChartCard>
            </div>
          </Section>

          <Section id="marketplace" title="Marketplace">
            <div className="stat-grid">
              <StatTile label="Listings created" value={data.marketplace.created} />
              <StatTile label="Items sold" value={data.marketplace.sold} />
              <StatTile label="Active listings" value={data.marketplace.activeNow} hint="Right now" />
              <StatTile label="Sell-through rate" value={data.marketplace.sellThroughRate} suffix="%" hint="Sold of those listed" />
              <StatTile label="Average asking price" value={`D${data.marketplace.averagePrice.toLocaleString()}`} hint="Active listings" />
            </div>
            <div className="chart-grid">
              <ChartCard
                title="New listings"
                subtitle={`Per ${iv}`}
                table={<DataTable columns={['Period starting', 'Listings']} rows={seriesRows(data.marketplace.series, ['count'])} />}
              >
                <LineChart data={data.marketplace.series} series={[{ key: 'count', label: 'Listings' }]} interval={iv} height={200} />
              </ChartCard>
              <ChartCard title="Active listings by category">
                <BarList items={toItems(data.marketplace.byCategory, MARKET_CATEGORIES)} empty="No active listings." />
              </ChartCard>
            </div>
          </Section>

          <Section id="popular" title="Popular interests, skills and goals">
            <p className="muted section-note">Across all active students, not limited to the date range.</p>
            <div className="chart-grid chart-grid-3">
              <ChartCard title="Interests">
                <BarList items={data.popular.interests.map((r) => ({ label: r.value, value: r.count }))} empty="No interests added yet." />
              </ChartCard>
              <ChartCard title="Skills">
                <BarList items={data.popular.skills.map((r) => ({ label: r.value, value: r.count }))} empty="No skills added yet." />
              </ChartCard>
              <ChartCard title="Connection goals">
                <BarList items={data.popular.goals.map((r) => ({ label: GOAL_LABELS[r.value] ?? r.value, value: r.count }))} empty="No goals chosen yet." />
              </ChartCard>
            </div>
          </Section>
          <p className="muted print-footer">Generated {new Date(data.generatedAt).toLocaleString()} · SunuCampus</p>
        </>
      )}
    </div>
  );
}
