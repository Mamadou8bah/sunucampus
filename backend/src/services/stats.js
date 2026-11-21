/**
 * Platform usage statistics for the reporting module (docs/PROPOSAL.md §4.4).
 * Everything is computed with MongoDB aggregation pipelines over a date range.
 * Messaging statistics are counts only; message content is never read.
 */
import { User } from '../models/User.js';
import { Post, Comment, CONTENT_STATUS } from '../models/Post.js';
import { Connection, CONNECTION_STATUS } from '../models/Connection.js';
import { Community, COMMUNITY_STATUS } from '../models/Community.js';
import { Message, Conversation } from '../models/Message.js';
import { Report, REPORT_STATUS } from '../models/Report.js';
import { Listing, LISTING_STATUS } from '../models/Listing.js';
import { ACCOUNT_STATUS } from '../config/roles.js';

const DAY = 86_400_000;

/* ------------------------------ helpers ------------------------------ */

const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id ?? 'not set', r.count]));
const round = (n, digits = 1) => (Number.isFinite(n) ? Number(n.toFixed(digits)) : 0);

/** Start of the bucket containing `date`, in UTC (weeks start on Monday). */
function bucketStart(date, interval) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (interval === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (interval === 'month') d.setUTCDate(1);
  return d;
}

function nextBucket(date, interval) {
  const d = new Date(date);
  if (interval === 'day') d.setUTCDate(d.getUTCDate() + 1);
  if (interval === 'week') d.setUTCDate(d.getUTCDate() + 7);
  if (interval === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Every bucket in the range, so charts show zero for quiet periods instead of gaps. */
function buckets(from, to, interval) {
  const out = [];
  for (let d = bucketStart(from, interval); d <= to; d = nextBucket(d, interval)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/** Counts documents per time bucket using $dateTrunc. */
async function timeSeries(model, range, { field = 'createdAt', match = {} } = {}) {
  const rows = await model.aggregate([
    { $match: { ...match, [field]: { $gte: range.from, $lte: range.to } } },
    {
      $group: {
        _id: { $dateTrunc: { date: `$${field}`, unit: range.interval, startOfWeek: 'monday', timezone: 'UTC' } },
        count: { $sum: 1 },
      },
    },
  ]);
  const byBucket = new Map(rows.map((r) => [r._id.toISOString().slice(0, 10), r.count]));
  return range.buckets.map((date) => ({ date, count: byBucket.get(date) ?? 0 }));
}

const countBy = (model, field, match = {}) =>
  model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }]);

const topValues = (field, limit = 10) =>
  User.aggregate([
    { $match: { status: ACCOUNT_STATUS.ACTIVE } },
    { $unwind: `$${field}` },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, value: '$_id', count: 1 } },
  ]);

/** Normalises query input into a range with buckets. Defaults to the last 30 days by day. */
export function buildRange({ from, to, interval } = {}) {
  const end = to ? new Date(to) : new Date();
  // A date-only "to" means the whole of that day.
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to))) end.setUTCHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getTime() - 29 * DAY);
  start.setUTCHours(0, 0, 0, 0);
  const days = (end - start) / DAY;
  const chosen = interval ?? (days > 180 ? 'month' : days > 60 ? 'week' : 'day');
  return { from: start, to: end, interval: chosen, buckets: buckets(start, end, chosen) };
}

/* ------------------------------ sections ------------------------------ */

export async function userStats(range) {
  const now = Date.now();
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const [total, newInRange, byRole, byStatus, byProgramme, byYear, dau, wau, mau, registrations, completeProfiles, verified] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments(inRange),
      countBy(User, 'role'),
      countBy(User, 'status'),
      User.aggregate([
        { $group: { _id: { $ifNull: ['$programme', 'Not set'] }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 10 },
      ]),
      User.aggregate([{ $group: { _id: '$yearOfStudy', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      User.countDocuments({ lastActiveAt: { $gte: new Date(now - DAY) } }),
      User.countDocuments({ lastActiveAt: { $gte: new Date(now - 7 * DAY) } }),
      User.countDocuments({ lastActiveAt: { $gte: new Date(now - 30 * DAY) } }),
      timeSeries(User, range),
      User.countDocuments({ 'goals.0': { $exists: true }, $or: [{ 'interests.0': { $exists: true } }, { 'skills.0': { $exists: true } }] }),
      User.countDocuments({ emailVerifiedAt: { $ne: null } }),
    ]);

  return {
    total,
    newInRange,
    // Based on each user's most recent activity, so these describe "now", not the selected range.
    active: { day: dau, week: wau, month: mau },
    verified,
    verifiedRate: round(total ? (verified / total) * 100 : 0),
    profileCompletionRate: round(total ? (completeProfiles / total) * 100 : 0),
    byRole: toMap(byRole),
    byStatus: toMap(byStatus),
    byProgramme: byProgramme.map((r) => ({ programme: r._id, count: r.count })),
    byYear: byYear.map((r) => ({ year: r._id ?? 'Not set', count: r.count })),
    registrations,
  };
}

export async function engagementStats(range) {
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const [posts, comments, likesOnPosts, postSeries, commentSeries, topPosts, activePosters, activeCommenters] = await Promise.all([
    Post.countDocuments(inRange),
    Comment.countDocuments(inRange),
    Post.aggregate([{ $match: inRange }, { $group: { _id: null, likes: { $sum: '$likeCount' } } }]),
    timeSeries(Post, range),
    timeSeries(Comment, range),
    Post.find({ ...inRange, status: CONTENT_STATUS.VISIBLE })
      .sort({ likeCount: -1, commentCount: -1 })
      .limit(5)
      .populate('author', 'name'),
    Post.aggregate([{ $match: inRange }, { $group: { _id: '$author', posts: { $sum: 1 } } }]),
    Comment.aggregate([{ $match: inRange }, { $group: { _id: '$author', comments: { $sum: 1 } } }]),
  ]);

  // Combine post and comment counts per student to find the most active.
  const activity = new Map();
  for (const r of activePosters) activity.set(r._id.toString(), { posts: r.posts, comments: 0 });
  for (const r of activeCommenters) {
    const entry = activity.get(r._id.toString()) ?? { posts: 0, comments: 0 };
    entry.comments = r.comments;
    activity.set(r._id.toString(), entry);
  }
  const topIds = [...activity.entries()]
    .sort((a, b) => b[1].posts + b[1].comments - (a[1].posts + a[1].comments))
    .slice(0, 5);
  const names = new Map((await User.find({ _id: { $in: topIds.map(([id]) => id) } }, 'name')).map((u) => [u.id, u.name]));

  const series = range.buckets.map((date, i) => ({ date, posts: postSeries[i].count, comments: commentSeries[i].count }));

  return {
    posts,
    comments,
    // Likes on posts created in the range (likes themselves are not timestamped).
    likes: likesOnPosts[0]?.likes ?? 0,
    activeAuthors: activity.size,
    series,
    topPosts: topPosts.map((p) => ({
      id: p.id,
      excerpt: p.content.slice(0, 120),
      author: p.author?.name ?? 'Deleted user',
      likes: p.likeCount,
      comments: p.commentCount,
      createdAt: p.createdAt,
    })),
    mostActiveUsers: topIds.map(([id, a]) => ({ id, name: names.get(id) ?? 'Deleted user', ...a, total: a.posts + a.comments })),
  };
}

export async function connectionStats(range) {
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const [sent, byStatus, bySource, acceptedTotal, users, series] = await Promise.all([
    Connection.countDocuments(inRange),
    countBy(Connection, 'status', inRange),
    countBy(Connection, 'source', inRange),
    Connection.countDocuments({ status: CONNECTION_STATUS.ACCEPTED }),
    User.countDocuments(),
    timeSeries(Connection, range),
  ]);

  const status = toMap(byStatus);
  const accepted = status.accepted ?? 0;
  const rejected = status.rejected ?? 0;
  const sources = toMap(bySource);

  return {
    requestsSent: sent,
    accepted,
    rejected,
    pending: status.pending ?? 0,
    acceptanceRate: round(accepted + rejected ? (accepted / (accepted + rejected)) * 100 : 0),
    // Each accepted connection links two students.
    averageConnectionsPerUser: round(users ? (acceptedTotal * 2) / users : 0, 2),
    bySource: { match: sources.match ?? 0, discover: sources.discover ?? 0, profile: sources.profile ?? 0 },
    fromMatchingRate: round(sent ? ((sources.match ?? 0) / sent) * 100 : 0),
    series,
  };
}

export async function communityStats(range) {
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const [byStatus, byCategory, largest, mostActive, createdInRange] = await Promise.all([
    countBy(Community, 'status'),
    countBy(Community, 'category', { status: COMMUNITY_STATUS.ACTIVE }),
    Community.find({ status: COMMUNITY_STATUS.ACTIVE }).sort({ memberCount: -1 }).limit(5),
    Post.aggregate([
      { $match: { ...inRange, community: { $ne: null } } },
      { $group: { _id: '$community', posts: { $sum: 1 } } },
      { $sort: { posts: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'communities', localField: '_id', foreignField: '_id', as: 'community' } },
      { $unwind: '$community' },
      { $project: { _id: 0, id: '$_id', name: '$community.name', slug: '$community.slug', posts: 1 } },
    ]),
    Community.countDocuments(inRange),
  ]);

  const status = toMap(byStatus);
  return {
    total: Object.values(status).reduce((a, b) => a + b, 0),
    byStatus: status,
    createdInRange,
    byCategory: toMap(byCategory),
    largest: largest.map((c) => ({ id: c.id, name: c.name, slug: c.slug, members: c.memberCount })),
    mostActive,
  };
}

export async function messagingStats(range) {
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const [messages, activeConversations, senders, series, totalConversations] = await Promise.all([
    Message.countDocuments(inRange),
    Message.distinct('conversation', inRange),
    Message.distinct('sender', inRange),
    timeSeries(Message, range),
    Conversation.countDocuments({ 'lastMessage.createdAt': { $exists: true } }),
  ]);
  return {
    messages,
    activeConversations: activeConversations.length,
    activeSenders: senders.length,
    averagePerConversation: round(activeConversations.length ? messages / activeConversations.length : 0),
    totalConversations,
    series,
  };
}

export async function moderationStats(range) {
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const [received, byStatus, byReason, byTarget, byAction, resolution, openNow, accounts, hiddenOrRemoved] = await Promise.all([
    Report.countDocuments(inRange),
    countBy(Report, 'status', inRange),
    countBy(Report, 'reason', inRange),
    countBy(Report, 'targetType', inRange),
    countBy(Report, 'action', { ...inRange, status: REPORT_STATUS.RESOLVED }),
    Report.aggregate([
      { $match: { ...inRange, resolvedAt: { $ne: null } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } } } },
    ]),
    Report.countDocuments({ status: REPORT_STATUS.OPEN }),
    countBy(User, 'status'),
    Post.countDocuments({ ...inRange, status: { $ne: CONTENT_STATUS.VISIBLE }, moderatedBy: { $ne: null } }),
  ]);

  const status = toMap(byStatus);
  const accountStatus = toMap(accounts);
  return {
    received,
    resolved: status.resolved ?? 0,
    dismissed: status.dismissed ?? 0,
    pending: status.open ?? 0,
    openNow,
    averageResolutionHours: round((resolution[0]?.avgMs ?? 0) / 3_600_000),
    byReason: toMap(byReason),
    byTargetType: toMap(byTarget),
    actionsTaken: toMap(byAction),
    postsModerated: hiddenOrRemoved,
    suspendedAccounts: accountStatus.suspended ?? 0,
    bannedAccounts: accountStatus.banned ?? 0,
    series: await timeSeries(Report, range),
  };
}

export async function marketplaceStats(range) {
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const [created, sold, activeNow, byCategory, prices, series] = await Promise.all([
    Listing.countDocuments(inRange),
    Listing.countDocuments({ soldAt: { $gte: range.from, $lte: range.to } }),
    Listing.countDocuments({ status: LISTING_STATUS.ACTIVE }),
    countBy(Listing, 'category', { status: LISTING_STATUS.ACTIVE }),
    Listing.aggregate([{ $match: { status: LISTING_STATUS.ACTIVE } }, { $group: { _id: null, avg: { $avg: '$price' } } }]),
    timeSeries(Listing, range),
  ]);
  return {
    created,
    sold,
    activeNow,
    sellThroughRate: round(created ? (sold / created) * 100 : 0),
    averagePrice: Math.round(prices[0]?.avg ?? 0),
    byCategory: toMap(byCategory),
    series,
  };
}

export async function popularStats() {
  const [interests, skills, goals] = await Promise.all([topValues('interests'), topValues('skills'), topValues('goals')]);
  return { interests, skills, goals };
}

export const SECTIONS = {
  users: userStats,
  engagement: engagementStats,
  connections: connectionStats,
  communities: communityStats,
  messaging: messagingStats,
  moderation: moderationStats,
  marketplace: marketplaceStats,
  popular: popularStats,
};

export async function buildReport(range, sections = Object.keys(SECTIONS)) {
  const results = await Promise.all(sections.map((s) => SECTIONS[s](range)));
  return {
    range: { from: range.from, to: range.to, interval: range.interval },
    generatedAt: new Date(),
    ...Object.fromEntries(sections.map((s, i) => [s, results[i]])),
  };
}
