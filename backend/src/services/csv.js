/** Minimal RFC 4180 CSV writer. Cells that could be read as formulas are prefixed to stop CSV injection. */
function cell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (rows) => rows.map((row) => row.map(cell).join(',')).join('\r\n');

const mapRows = (obj) => Object.entries(obj ?? {}).map(([k, v]) => [k, v]);

/**
 * Turns a statistics report into a list of titled tables.
 * Each table is { title, columns, rows } and becomes a block in the CSV.
 */
export function reportTables(report) {
  const t = [];
  const add = (title, columns, rows) => t.push({ title, columns, rows });
  const { users: u, engagement: e, connections: c, communities: cm, messaging: m, moderation: mod, marketplace: mk, popular: p } = report;

  if (u) {
    add('Users: summary', ['Metric', 'Value'], [
      ['Total users', u.total],
      ['New users in range', u.newInRange],
      ['Active in last 24 hours', u.active.day],
      ['Active in last 7 days', u.active.week],
      ['Active in last 30 days', u.active.month],
      ['Profile completion rate (%)', u.profileCompletionRate],
      ['Verified UTG email', u.verified],
      ['Verified rate (%)', u.verifiedRate],
    ]);
    add('Users: by role', ['Role', 'Users'], mapRows(u.byRole));
    add('Users: by status', ['Status', 'Users'], mapRows(u.byStatus));
    add('Users: by programme (top 10)', ['Programme', 'Users'], u.byProgramme.map((r) => [r.programme, r.count]));
    add('Users: by year of study', ['Year', 'Users'], u.byYear.map((r) => [r.year, r.count]));
    add('Users: registrations', ['Period starting', 'Registrations'], u.registrations.map((r) => [r.date, r.count]));
  }
  if (e) {
    add('Engagement: summary', ['Metric', 'Value'], [
      ['Posts', e.posts],
      ['Comments', e.comments],
      ['Likes on posts created in range', e.likes],
      ['Students who posted or commented', e.activeAuthors],
    ]);
    add('Engagement: over time', ['Period starting', 'Posts', 'Comments'], e.series.map((r) => [r.date, r.posts, r.comments]));
    add('Engagement: top posts', ['Author', 'Excerpt', 'Likes', 'Comments', 'Created'], e.topPosts.map((r) => [r.author, r.excerpt, r.likes, r.comments, r.createdAt]));
    add('Engagement: most active students', ['Student', 'Posts', 'Comments', 'Total'], e.mostActiveUsers.map((r) => [r.name, r.posts, r.comments, r.total]));
  }
  if (c) {
    add('Connections: summary', ['Metric', 'Value'], [
      ['Requests sent', c.requestsSent],
      ['Accepted', c.accepted],
      ['Rejected', c.rejected],
      ['Pending', c.pending],
      ['Acceptance rate (%)', c.acceptanceRate],
      ['Average connections per user', c.averageConnectionsPerUser],
      ['Requests from smart matching (%)', c.fromMatchingRate],
      ['Accepted smart-match requests', c.acceptedFromMatching],
    ]);
    add('Connections: by source', ['Source', 'Requests'], mapRows(c.bySource));
    add('Connections: requests over time', ['Period starting', 'Requests'], c.series.map((r) => [r.date, r.count]));
  }
  if (cm) {
    add('Communities: by status', ['Status', 'Communities'], mapRows(cm.byStatus));
    add('Communities: active by category', ['Category', 'Communities'], mapRows(cm.byCategory));
    add('Communities: largest', ['Community', 'Members'], cm.largest.map((r) => [r.name, r.members]));
    add('Communities: fastest growing in range', ['Community', 'Net members'], cm.fastestGrowing.map((r) => [r.name, r.netMembers]));
    add('Communities: most active in range', ['Community', 'Posts'], cm.mostActive.map((r) => [r.name, r.posts]));
  }
  if (m) {
    add('Messaging: summary (counts only)', ['Metric', 'Value'], [
      ['Messages sent', m.messages],
      ['Active conversations', m.activeConversations],
      ['Students who sent messages', m.activeSenders],
      ['Average messages per active conversation', m.averagePerConversation],
    ]);
    add('Messaging: over time', ['Period starting', 'Messages'], m.series.map((r) => [r.date, r.count]));
  }
  if (mod) {
    add('Moderation: summary', ['Metric', 'Value'], [
      ['Reports received', mod.received],
      ['Resolved', mod.resolved],
      ['Dismissed', mod.dismissed],
      ['Still open (from range)', mod.pending],
      ['Average resolution time (hours)', mod.averageResolutionHours],
      ['Posts moderated', mod.postsModerated],
      ['Suspended accounts (now)', mod.suspendedAccounts],
      ['Banned accounts (now)', mod.bannedAccounts],
    ]);
    add('Moderation: reports by reason', ['Reason', 'Reports'], mapRows(mod.byReason));
    add('Moderation: reports by content type', ['Type', 'Reports'], mapRows(mod.byTargetType));
    add('Moderation: actions taken', ['Action', 'Reports'], mapRows(mod.actionsTaken));
  }
  if (mk) {
    add('Marketplace: summary', ['Metric', 'Value'], [
      ['Listings created', mk.created],
      ['Items sold', mk.sold],
      ['Active listings now', mk.activeNow],
      ['Sell-through rate (%)', mk.sellThroughRate],
      ['Average asking price (dalasi)', mk.averagePrice],
    ]);
    add('Marketplace: active listings by category', ['Category', 'Listings'], mapRows(mk.byCategory));
    add('Marketplace: listings over time', ['Period starting', 'Listings'], mk.series.map((r) => [r.date, r.count]));
  }
  if (p) {
    add('Popular interests', ['Interest', 'Students'], p.interests.map((r) => [r.value, r.count]));
    add('Popular skills', ['Skill', 'Students'], p.skills.map((r) => [r.value, r.count]));
    add('Popular connection goals', ['Goal', 'Students'], p.goals.map((r) => [r.value, r.count]));
  }
  return t;
}

export function reportToCsv(report) {
  const rows = [
    ['SunuCampus usage report'],
    ['From', report.range.from.toISOString().slice(0, 10), 'To', report.range.to.toISOString().slice(0, 10)],
    ['Generated', report.generatedAt.toISOString()],
  ];
  for (const table of reportTables(report)) {
    rows.push([], [table.title], table.columns, ...table.rows);
  }
  return toCsv(rows);
}
