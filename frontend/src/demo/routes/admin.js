// Admin routes of the in-browser demo API. Port of backend/src/routes/admin.js and its controllers
// (adminUserController, adminModerationController, adminStatsController) plus services/stats.js and csv.js.
import { z } from 'zod';
import {
  db,
  byId,
  findAll,
  update,
  nowISO,
  sameId,
  badRequest,
  notFound,
  conflict,
  validate,
  userJSON,
  cleanJSON,
  register,
  respond,
} from '../core.js';
import { recordAudit, notify } from '../shared.js';

/* ------------------------------ Constants (from the models) ------------------------------ */

const ROLES = { STUDENT: 'student', MODERATOR: 'moderator', ADMIN: 'admin' };
const ROLE_LIST = Object.values(ROLES);
const ACCOUNT_STATUS = { ACTIVE: 'active', SUSPENDED: 'suspended', BANNED: 'banned' };
const STATUS_LIST = Object.values(ACCOUNT_STATUS);
const REPORT_TARGETS = ['post', 'comment', 'community', 'user', 'listing'];
const REPORT_STATUS = { OPEN: 'open', RESOLVED: 'resolved', DISMISSED: 'dismissed' };
const REPORT_ACTIONS = ['none', 'content_hidden', 'content_removed', 'user_warned', 'user_suspended', 'user_banned', 'community_archived'];
const CONTENT_STATUS = { VISIBLE: 'visible', HIDDEN: 'hidden', REMOVED: 'removed' };
const COMMUNITY_STATUS = { PENDING: 'pending', ACTIVE: 'active', REJECTED: 'rejected', ARCHIVED: 'archived' };
const LISTING_STATUS = { ACTIVE: 'active', SOLD: 'sold', HIDDEN: 'hidden', REMOVED: 'removed' };
const CONNECTION_STATUS = { PENDING: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' };

/* ------------------------------ Validation (validators/admin.js, moderation.js) ------------------------------ */

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const page = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const reasonField = z.string().trim().max(500).optional();

const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLE_LIST).optional(),
  status: z.enum(STATUS_LIST).optional(),
  ...page,
});
const updateRoleSchema = z.object({ role: z.enum(ROLE_LIST) });
const updateStatusSchema = z.object({ status: z.enum(STATUS_LIST), reason: z.string().trim().max(500).optional() });
const auditLogQuery = z.object({ ...page });
const warnSchema = z.object({
  message: z.string().trim().min(10, 'Write at least 10 characters').max(1000),
  targetType: z.enum(['post', 'comment', 'listing', 'community', 'user']).optional(),
  targetId: objectId.optional(),
});

const reportsQuery = z.object({
  status: z.enum(Object.values(REPORT_STATUS)).optional(),
  targetType: z.enum(REPORT_TARGETS).optional(),
  ...page,
});
const resolveReportSchema = z
  .object({
    status: z.enum([REPORT_STATUS.RESOLVED, REPORT_STATUS.DISMISSED]),
    action: z.enum(REPORT_ACTIONS).default('none'),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.status === REPORT_STATUS.RESOLVED || v.action === 'none', {
    message: 'A dismissed report cannot take an action',
    path: ['action'],
  });
const adminPostsQuery = z.object({
  status: z.enum(Object.values(CONTENT_STATUS)).optional(),
  reported: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
  ...page,
});
const contentStatusSchema = z.object({ status: z.enum(Object.values(CONTENT_STATUS)), reason: reasonField });
const adminCommunitiesQuery = z.object({
  status: z.enum(Object.values(COMMUNITY_STATUS)).optional(),
  q: z.string().trim().max(100).optional(),
  ...page,
});
const communityStatusSchema = z.object({ status: z.enum(Object.values(COMMUNITY_STATUS)), reason: reasonField });

const SECTION_NAMES = ['users', 'engagement', 'connections', 'communities', 'messaging', 'moderation', 'marketplace', 'popular'];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const statsQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    interval: z.enum(['day', 'week', 'month']).optional(),
    section: z.enum(['all', ...SECTION_NAMES]).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"From" must be before "to"', path: ['from'] })
  .refine((q) => !q.from || !q.to || (new Date(q.to) - new Date(q.from)) / 86_400_000 <= 731, {
    message: 'Choose a range of two years or less',
    path: ['from'],
  });

/** Like a query string: empty and missing values are dropped, everything else is a string. */
const cleanQuery = (query = {}) =>
  Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
const vQuery = (schema, ctx) => validate(schema, cleanQuery(ctx.query));

/* ------------------------------ Helpers ------------------------------ */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageInfo = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
const newestFirst = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
const paginate = (items, page, limit) => items.slice((page - 1) * limit, page * limit);
const userSummary = (u) => u && { id: u._id, name: u.name, email: u.email, role: u.role, status: u.status };
/** Mirrors a populated ref: undefined when the field is unset, null when the referenced doc is gone. */
const populated = (collection, id) => (id == null ? undefined : byId(collection, id));
/** A populated User subdocument serialised with User.toJSON (unselected emailVerifiedAt => isVerified false). */
const populatedUser = (id, fields) => {
  const u = populated('users', id);
  if (!u) return u;
  const out = { id: u._id };
  for (const f of fields.split(' ')) out[f] = u[f];
  out.isVerified = false;
  return out;
};

const reportJSON = (r) => cleanJSON(r);
const communityJSON = (c) => {
  const { members: _members, ...rest } = cleanJSON(c);
  return rest;
};
const auditJSON = (log, actorFields) => {
  const { _id, updatedAt: _u, actor, ...rest } = log;
  return { ...rest, actor: populatedUser(actor, actorFields), id: _id };
};

/* ------------------------------ Users ------------------------------ */

function listUsers(ctx) {
  const { q, role, status, page, limit } = vQuery(listUsersQuery, ctx);
  const pattern = q ? new RegExp(escapeRegex(q), 'i') : null;
  const matches = findAll(
    'users',
    (u) =>
      (!role || u.role === role) &&
      (!status || u.status === status) &&
      (!pattern || [u.name, u.email, u.programme].some((v) => typeof v === 'string' && pattern.test(v))),
  ).sort(newestFirst);
  return { users: paginate(matches, page, limit).map(userJSON), ...pageInfo(page, limit, matches.length) };
}

function getUser({ params }) {
  const user = byId('users', params.id);
  if (!user) throw notFound('User not found');
  return { user: userJSON(user) };
}

/** Stops an admin from locking themselves out or removing the last active admin. */
function guardAdminChange(actor, target) {
  if (sameId(actor._id, target._id)) throw badRequest('You cannot remove your own administrator access');
  if (target.role === ROLES.ADMIN && target.status === ACCOUNT_STATUS.ACTIVE) {
    const activeAdmins = db.users.filter((u) => u.role === ROLES.ADMIN && u.status === ACCOUNT_STATUS.ACTIVE).length;
    if (activeAdmins <= 1) throw badRequest('The platform must keep at least one active administrator');
  }
}

function updateRole(ctx) {
  const { role } = validate(updateRoleSchema, ctx.body);
  const user = byId('users', ctx.params.id);
  if (!user) throw notFound('User not found');
  if (user.role === role) return { user: userJSON(user) };
  if (user.role === ROLES.ADMIN) guardAdminChange(ctx.me, user);

  const previous = user.role;
  update(user, { role });
  recordAudit(ctx.me, 'user.role_changed', 'User', user._id, { from: previous, to: role });
  return { user: userJSON(user) };
}

function updateStatus(ctx) {
  const { status, reason } = validate(updateStatusSchema, ctx.body);
  const user = byId('users', ctx.params.id);
  if (!user) throw notFound('User not found');
  if (user.status === status) return { user: userJSON(user) };
  if (user.role === ROLES.ADMIN && status !== ACCOUNT_STATUS.ACTIVE) guardAdminChange(ctx.me, user);

  const previous = user.status;
  update(user, { status });
  if (status === ACCOUNT_STATUS.ACTIVE || reason === undefined) delete user.statusReason;
  else user.statusReason = reason;
  recordAudit(ctx.me, 'user.status_changed', 'User', user._id, { from: previous, to: status, reason });
  return { user: userJSON(user) };
}

function listAuditLogs(ctx) {
  const { page, limit } = vQuery(auditLogQuery, ctx);
  const logs = [...db.auditlogs].sort(newestFirst);
  return { logs: paginate(logs, page, limit).map((l) => auditJSON(l, 'name email role')), ...pageInfo(page, limit, logs.length) };
}

function warn(ctx) {
  const { message, targetType, targetId } = validate(warnSchema, ctx.body);
  const user = warnUser(ctx.me, ctx.params.id, message, { targetType, targetId });
  return respond(201, { user: { id: user._id, warningCount: user.warningCount, lastWarnedAt: user.lastWarnedAt } });
}

/* ------------------------------ Reports queue ------------------------------ */

/** A short description of whatever was reported, for the moderation queue. */
function describeTarget(type, id) {
  switch (type) {
    case 'post': {
      const p = byId('posts', id);
      if (!p) return null;
      const community = populated('communities', p.community);
      return {
        id: p._id,
        content: p.content,
        status: p.status,
        author: userSummary(byId('users', p.author)),
        community: community && { name: community.name, slug: community.slug },
        createdAt: p.createdAt,
      };
    }
    case 'comment': {
      const c = byId('comments', id);
      return c && { id: c._id, content: c.content, status: c.status, author: userSummary(byId('users', c.author)), postId: String(c.post), createdAt: c.createdAt };
    }
    case 'community': {
      const c = byId('communities', id);
      return c && { id: c._id, name: c.name, slug: c.slug, description: c.description, status: c.status, author: userSummary(byId('users', c.creator)) };
    }
    case 'user': {
      const u = byId('users', id);
      return u && { id: u._id, name: u.name, bio: u.bio, status: u.status, author: userSummary(u) };
    }
    case 'listing': {
      const l = byId('listings', id);
      return l && { id: l._id, name: `${l.title} (D${l.price})`, content: l.description, photo: (l.photos ?? [])[0], status: l.status, author: userSummary(byId('users', l.seller)) };
    }
    default:
      return null;
  }
}

const openReportsOn = (targetType, targetId) =>
  db.reports.filter((r) => r.targetType === targetType && sameId(r.targetId, targetId) && r.status === REPORT_STATUS.OPEN);

function listReports(ctx) {
  const { status, targetType, page, limit } = vQuery(reportsQuery, ctx);
  const matches = findAll('reports', (r) => (!status || r.status === status) && (!targetType || r.targetType === targetType)).sort(newestFirst);

  const reports = paginate(matches, page, limit).map((r) => {
    const reporter = populated('users', r.reporter);
    const resolvedBy = populated('users', r.resolvedBy);
    return {
      ...reportJSON(r),
      reporter: reporter && { id: reporter._id, name: reporter.name, email: reporter.email },
      resolvedBy: resolvedBy && { id: resolvedBy._id, name: resolvedBy.name },
      target: describeTarget(r.targetType, r.targetId),
      // How many students reported the same item and are still waiting.
      openReportsOnTarget: openReportsOn(r.targetType, r.targetId).length,
    };
  });
  return { reports, ...pageInfo(page, limit, matches.length) };
}

/** Finds the user responsible for a reported item. */
function responsibleUserId(type, id) {
  if (type === 'user') return id;
  if (type === 'community') return byId('communities', id)?.creator;
  if (type === 'listing') return byId('listings', id)?.seller;
  return byId(type === 'post' ? 'posts' : 'comments', id)?.author;
}

function setAccountStatus(admin, userId, status, reason) {
  const user = byId('users', userId);
  if (!user) throw notFound('The responsible user no longer exists');
  if (user.role === ROLES.ADMIN) throw badRequest('Administrators cannot be suspended from the reports queue');
  if (user.status === status) return;
  const previous = user.status;
  update(user, { status, statusReason: reason });
  recordAudit(admin, 'user.status_changed', 'User', user._id, { from: previous, to: status, reason, via: 'report' });
}

function setContentStatus(admin, type, id, status, reason) {
  const doc = byId(type === 'post' ? 'posts' : 'comments', id);
  if (!doc) throw notFound('Content not found');
  if (doc.status === status) return doc;
  const previous = doc.status;
  const changes = { status, moderatedBy: admin._id };
  if (type === 'post') changes.moderationReason = reason;
  update(doc, changes);
  if (type === 'post' && reason === undefined) delete doc.moderationReason;

  // Keep the post's comment counter in step with visible comments.
  if (type === 'comment') {
    const delta = (status === CONTENT_STATUS.VISIBLE ? 1 : 0) - (previous === CONTENT_STATUS.VISIBLE ? 1 : 0);
    const post = byId('posts', doc.post);
    if (delta && post) update(post, { commentCount: (post.commentCount ?? 0) + delta });
  }
  recordAudit(admin, `${type}.status_changed`, type === 'post' ? 'Post' : 'Comment', doc._id, { from: previous, to: status, reason });
  if (status !== CONTENT_STATUS.VISIBLE) {
    notify({ recipient: doc.author, type: 'content_moderated', subject: type, text: reason });
  }
  return doc;
}

function setListingStatus(admin, id, status, reason) {
  const listing = byId('listings', id);
  if (!listing) throw notFound('Listing not found');
  if (listing.status === status) return;
  const previous = listing.status;
  update(listing, { status, moderatedBy: admin._id });
  recordAudit(admin, 'listing.status_changed', 'Listing', listing._id, { from: previous, to: status, reason, name: listing.title });
  if ([LISTING_STATUS.HIDDEN, LISTING_STATUS.REMOVED].includes(status)) {
    notify({ recipient: listing.seller, type: 'content_moderated', subject: 'listing', text: reason });
  }
}

const REASON_TEXT = {
  spam: 'posting spam',
  harassment: 'harassing other students',
  inappropriate: 'sharing inappropriate content',
  misinformation: 'sharing misleading information',
  impersonation: 'pretending to be someone else',
  other: 'breaking the community guidelines',
};
const defaultWarning = (reason) =>
  `Students reported you for ${REASON_TEXT[reason] ?? REASON_TEXT.other}. Please follow the SunuCampus guidelines. Further reports may lead to your account being suspended.`;

/** Records a warning on the account and tells the student straight away. */
function warnUser(admin, userId, message, details = {}) {
  const user = byId('users', userId);
  if (!user) throw notFound('The responsible user no longer exists');
  if (user.role === ROLES.ADMIN) throw badRequest('Administrators cannot be warned');
  update(user, { warningCount: (user.warningCount ?? 0) + 1, lastWarnedAt: nowISO() });
  recordAudit(admin, 'user.warned', 'User', user._id, { message, ...details });
  notify({ recipient: user._id, type: 'warning', text: message, subject: details.targetType });
  return user;
}

function resolveReport(ctx) {
  const { status, action, note } = validate(resolveReportSchema, ctx.body);
  const report = byId('reports', ctx.params.id);
  if (!report) throw notFound('Report not found');
  if (report.status !== REPORT_STATUS.OPEN) throw conflict('This report has already been handled');

  const { targetType, targetId } = report;
  const reason = note || `Reported for ${report.reason}`;
  const before = reportJSON({ ...report });

  if (['content_hidden', 'content_removed'].includes(action) && !['post', 'comment', 'listing'].includes(targetType)) {
    throw badRequest('Only posts, comments and listings can be hidden or removed');
  }
  if (action === 'community_archived' && targetType !== 'community') {
    throw badRequest('Only communities can be archived');
  }

  switch (action) {
    case 'content_hidden':
    case 'content_removed': {
      const hide = action === 'content_hidden';
      if (targetType === 'listing') setListingStatus(ctx.me, targetId, hide ? LISTING_STATUS.HIDDEN : LISTING_STATUS.REMOVED, reason);
      else setContentStatus(ctx.me, targetType, targetId, hide ? CONTENT_STATUS.HIDDEN : CONTENT_STATUS.REMOVED, reason);
      break;
    }
    case 'user_suspended':
    case 'user_banned':
      setAccountStatus(ctx.me, responsibleUserId(targetType, targetId), action === 'user_banned' ? ACCOUNT_STATUS.BANNED : ACCOUNT_STATUS.SUSPENDED, reason);
      break;
    case 'user_warned':
      warnUser(ctx.me, responsibleUserId(targetType, targetId), note || defaultWarning(report.reason), { targetType, targetId, via: 'report' });
      break;
    case 'community_archived': {
      const community = byId('communities', targetId);
      if (community) update(community, { status: COMMUNITY_STATUS.ARCHIVED, statusReason: reason });
      recordAudit(ctx.me, 'community.status_changed', 'Community', targetId, { to: COMMUNITY_STATUS.ARCHIVED, reason });
      break;
    }
    default:
      break;
  }

  // Every open report about the same item is closed with the same outcome.
  const resolution = { status, action, resolutionNote: note, resolvedBy: ctx.me._id, resolvedAt: nowISO() };
  const open = openReportsOn(targetType, targetId);
  for (const r of open) {
    update(r, resolution);
    if (note === undefined) delete r.resolutionNote;
  }
  recordAudit(ctx.me, `report.${status}`, 'Report', report._id, { action, targetType, targetId, closedReports: open.length });

  return { report: { ...before, ...resolution }, closedReports: open.length };
}

/* ------------------------------ Posts and comments ------------------------------ */

function listPosts(ctx) {
  const { status, reported, q, page, limit } = vQuery(adminPostsQuery, ctx);
  const pattern = q ? new RegExp(escapeRegex(q), 'i') : null;
  const reportedIds = reported === 'true'
    ? new Set(db.reports.filter((r) => r.targetType === 'post' && r.status === REPORT_STATUS.OPEN).map((r) => String(r.targetId)))
    : null;
  const matches = findAll(
    'posts',
    (p) => (!status || p.status === status) && (!pattern || pattern.test(p.content ?? '')) && (!reportedIds || reportedIds.has(p._id)),
  ).sort(newestFirst);

  const posts = paginate(matches, page, limit).map((p) => {
    const community = populated('communities', p.community);
    const moderatedBy = populated('users', p.moderatedBy);
    return {
      id: p._id,
      content: p.content,
      status: p.status,
      author: userSummary(byId('users', p.author)),
      community: community && { name: community.name, slug: community.slug },
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      moderatedBy: moderatedBy && { name: moderatedBy.name },
      moderationReason: p.moderationReason,
      openReports: openReportsOn('post', p._id).length,
      createdAt: p.createdAt,
    };
  });
  return { posts, ...pageInfo(page, limit, matches.length) };
}

function updatePostStatus(ctx) {
  const { status, reason } = validate(contentStatusSchema, ctx.body);
  const post = setContentStatus(ctx.me, 'post', ctx.params.id, status, reason);
  return { post: { id: post._id, status: post.status } };
}

function updateCommentStatus(ctx) {
  const { status, reason } = validate(contentStatusSchema, ctx.body);
  const comment = setContentStatus(ctx.me, 'comment', ctx.params.id, status, reason);
  return { comment: { id: comment._id, status: comment.status } };
}

/* ------------------------------ Communities ------------------------------ */

function listCommunities(ctx) {
  const { status, q, page, limit } = vQuery(adminCommunitiesQuery, ctx);
  const pattern = q ? new RegExp(escapeRegex(q), 'i') : null;
  const matches = findAll('communities', (c) => (!status || c.status === status) && (!pattern || pattern.test(c.name ?? ''))).sort(newestFirst);

  const communities = paginate(matches, page, limit).map((c) => {
    const reviewedBy = populated('users', c.reviewedBy);
    return {
      ...communityJSON(c),
      creator: userSummary(byId('users', c.creator)),
      reviewedBy: reviewedBy && { name: reviewedBy.name },
      moderators: undefined,
    };
  });
  return { communities, ...pageInfo(page, limit, matches.length) };
}

function updateCommunityStatus(ctx) {
  const { status, reason } = validate(communityStatusSchema, ctx.body);
  const community = byId('communities', ctx.params.id);
  if (!community) throw notFound('Community not found');

  const previous = community.status;
  if (previous === status) return { community: communityJSON(community) };

  update(community, { status, reviewedBy: ctx.me._id, reviewedAt: nowISO() });
  if (status === COMMUNITY_STATUS.ACTIVE || reason === undefined) delete community.statusReason;
  else community.statusReason = reason;

  // The creator of an approved community becomes a community moderator (docs/PROPOSAL.md §4.2).
  if (status === COMMUNITY_STATUS.ACTIVE) {
    const creator = byId('users', community.creator);
    if (creator && creator.role === ROLES.STUDENT) update(creator, { role: ROLES.MODERATOR });
  }
  recordAudit(ctx.me, 'community.status_changed', 'Community', community._id, { from: previous, to: status, reason, name: community.name });
  if (previous === COMMUNITY_STATUS.PENDING && [COMMUNITY_STATUS.ACTIVE, COMMUNITY_STATUS.REJECTED].includes(status)) {
    notify({
      recipient: community.creator,
      type: status === COMMUNITY_STATUS.ACTIVE ? 'community_approved' : 'community_rejected',
      community: community._id,
      text: status === COMMUNITY_STATUS.REJECTED ? reason : undefined,
    });
  }
  return { community: communityJSON(community) };
}

/* ------------------------------ Overview ------------------------------ */

function overview() {
  const now = Date.now();
  const day = new Date(now - 86_400_000).toISOString();
  const week = new Date(now - 7 * 86_400_000).toISOString();
  const since = (value, iso) => Boolean(value) && value >= iso;

  const counts = {
    totalUsers: db.users.length,
    newUsersWeek: db.users.filter((u) => since(u.createdAt, week)).length,
    activeWeek: db.users.filter((u) => since(u.lastActiveAt, week)).length,
    suspended: db.users.filter((u) => u.status !== ACCOUNT_STATUS.ACTIVE).length,
    postsTotal: db.posts.filter((p) => p.status === CONTENT_STATUS.VISIBLE).length,
    postsDay: db.posts.filter((p) => since(p.createdAt, day)).length,
    pendingCommunities: db.communities.filter((c) => c.status === COMMUNITY_STATUS.PENDING).length,
    activeCommunities: db.communities.filter((c) => c.status === COMMUNITY_STATUS.ACTIVE).length,
    openReports: db.reports.filter((r) => r.status === REPORT_STATUS.OPEN).length,
  };
  const recentUsers = [...db.users]
    .sort(newestFirst)
    .slice(0, 5)
    .map((u) => ({ id: u._id, name: u.name, email: u.email, programme: u.programme, createdAt: u.createdAt }));
  const recentActions = [...db.auditlogs].sort(newestFirst).slice(0, 6).map((l) => auditJSON(l, 'name'));
  return { counts, recentUsers, recentActions };
}

/* ------------------------------ Statistics (services/stats.js) ------------------------------ */

const DAY = 86_400_000;
const round = (n, digits = 1) => (Number.isFinite(n) ? Number(n.toFixed(digits)) : 0);
const time = (v) => (v == null ? NaN : new Date(v).getTime());
const inRangeOf = (range, field = 'createdAt') => (doc) => {
  const t = time(doc[field]);
  return t >= range.from.getTime() && t <= range.to.getTime();
};
const nonEmpty = (a) => Array.isArray(a) && a.length > 0;

/** Groups docs by a key and returns [{ _id, count }] sorted by count desc (like the countBy pipeline). */
function countBy(docs, key) {
  const counts = new Map();
  for (const d of docs) {
    const k = typeof key === 'function' ? key(d) : (d[key] ?? null);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([_id, count]) => ({ _id, count })).sort((a, b) => b.count - a.count);
}
const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id ?? 'not set', r.count]));

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

function buckets(from, to, interval) {
  const out = [];
  for (let d = bucketStart(from, interval); d <= to; d = nextBucket(d, interval)) out.push(d.toISOString().slice(0, 10));
  return out;
}

/** Counts docs per time bucket (like $dateTrunc), with zeros for quiet periods. */
function timeSeries(docs, range, { field = 'createdAt' } = {}) {
  const byBucket = new Map();
  for (const d of docs.filter(inRangeOf(range, field))) {
    const key = bucketStart(new Date(d[field]), range.interval).toISOString().slice(0, 10);
    byBucket.set(key, (byBucket.get(key) ?? 0) + 1);
  }
  return range.buckets.map((date) => ({ date, count: byBucket.get(date) ?? 0 }));
}

function topValues(field, limit = 10) {
  const values = [];
  for (const u of db.users) if (u.status === ACCOUNT_STATUS.ACTIVE) for (const v of u[field] ?? []) values.push(v);
  return countBy(values.map((value) => ({ value })), 'value')
    .sort((a, b) => b.count - a.count || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0))
    .slice(0, limit)
    .map((r) => ({ count: r.count, value: r._id }));
}

/** Normalises query input into a range with buckets. Defaults to the last 30 days by day. */
function buildRange({ from, to, interval } = {}) {
  const end = to ? new Date(to) : new Date();
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to))) end.setUTCHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getTime() - 29 * DAY);
  start.setUTCHours(0, 0, 0, 0);
  const days = (end - start) / DAY;
  const chosen = interval ?? (days > 180 ? 'month' : days > 60 ? 'week' : 'day');
  return { from: start, to: end, interval: chosen, buckets: buckets(start, end, chosen) };
}

function userStats(range) {
  const now = Date.now();
  const users = db.users;
  const total = users.length;
  const activeSince = (ms) => users.filter((u) => time(u.lastActiveAt) >= now - ms).length;
  const completeProfiles = users.filter((u) => nonEmpty(u.goals) && (nonEmpty(u.interests) || nonEmpty(u.skills))).length;
  const verified = users.filter((u) => u.emailVerifiedAt != null).length;
  const byProgramme = countBy(users, (u) => u.programme ?? 'Not set')
    .sort((a, b) => b.count - a.count || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0))
    .slice(0, 10);
  // Mongo sorts null before numbers.
  const byYear = countBy(users, 'yearOfStudy').sort((a, b) => (a._id == null ? -1 : b._id == null ? 1 : a._id - b._id));

  return {
    total,
    newInRange: users.filter(inRangeOf(range)).length,
    active: { day: activeSince(DAY), week: activeSince(7 * DAY), month: activeSince(30 * DAY) },
    verified,
    verifiedRate: round(total ? (verified / total) * 100 : 0),
    profileCompletionRate: round(total ? (completeProfiles / total) * 100 : 0),
    byRole: toMap(countBy(users, 'role')),
    byStatus: toMap(countBy(users, 'status')),
    byProgramme: byProgramme.map((r) => ({ programme: r._id, count: r.count })),
    byYear: byYear.map((r) => ({ year: r._id ?? 'Not set', count: r.count })),
    registrations: timeSeries(users, range),
  };
}

function engagementStats(range) {
  const posts = db.posts.filter(inRangeOf(range));
  const comments = db.comments.filter(inRangeOf(range));
  const postSeries = timeSeries(db.posts, range);
  const commentSeries = timeSeries(db.comments, range);
  const topPosts = posts
    .filter((p) => p.status === CONTENT_STATUS.VISIBLE)
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || (b.commentCount ?? 0) - (a.commentCount ?? 0))
    .slice(0, 5);

  // Combine post and comment counts per student to find the most active.
  const activity = new Map();
  for (const r of countBy(posts, 'author')) activity.set(String(r._id), { posts: r.count, comments: 0 });
  for (const r of countBy(comments, 'author')) {
    const entry = activity.get(String(r._id)) ?? { posts: 0, comments: 0 };
    entry.comments = r.count;
    activity.set(String(r._id), entry);
  }
  const topIds = [...activity.entries()].sort((a, b) => b[1].posts + b[1].comments - (a[1].posts + a[1].comments)).slice(0, 5);

  return {
    posts: posts.length,
    comments: comments.length,
    likes: posts.reduce((sum, p) => sum + (p.likeCount ?? 0), 0),
    activeAuthors: activity.size,
    series: range.buckets.map((date, i) => ({ date, posts: postSeries[i].count, comments: commentSeries[i].count })),
    topPosts: topPosts.map((p) => ({
      id: p._id,
      excerpt: (p.content ?? '').slice(0, 120),
      author: byId('users', p.author)?.name ?? 'Deleted user',
      likes: p.likeCount,
      comments: p.commentCount,
      createdAt: p.createdAt,
    })),
    mostActiveUsers: topIds.map(([id, a]) => ({ id, name: byId('users', id)?.name ?? 'Deleted user', ...a, total: a.posts + a.comments })),
  };
}

function connectionStats(range) {
  const inRange = db.connections.filter(inRangeOf(range));
  const status = toMap(countBy(inRange, 'status'));
  const sources = toMap(countBy(inRange, 'source'));
  const accepted = status.accepted ?? 0;
  const rejected = status.rejected ?? 0;
  const sent = inRange.length;
  const acceptedTotal = db.connections.filter((c) => c.status === CONNECTION_STATUS.ACCEPTED).length;
  const users = db.users.length;

  return {
    requestsSent: sent,
    accepted,
    rejected,
    pending: status.pending ?? 0,
    acceptanceRate: round(accepted + rejected ? (accepted / (accepted + rejected)) * 100 : 0),
    averageConnectionsPerUser: round(users ? (acceptedTotal * 2) / users : 0, 2),
    bySource: { match: sources.match ?? 0, discover: sources.discover ?? 0, profile: sources.profile ?? 0 },
    fromMatchingRate: round(sent ? ((sources.match ?? 0) / sent) * 100 : 0),
    series: timeSeries(db.connections, range),
  };
}

function communityStats(range) {
  const status = toMap(countBy(db.communities, 'status'));
  const active = db.communities.filter((c) => c.status === COMMUNITY_STATUS.ACTIVE);
  const largest = [...active].sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0)).slice(0, 5);
  const mostActive = countBy(db.posts.filter((p) => inRangeOf(range)(p) && p.community != null), 'community')
    .slice(0, 5)
    .map((r) => ({ posts: r.count, community: byId('communities', r._id), id: String(r._id) }))
    .filter((r) => r.community)
    .map((r) => ({ posts: r.posts, id: r.id, name: r.community.name, slug: r.community.slug }));

  return {
    total: Object.values(status).reduce((a, b) => a + b, 0),
    byStatus: status,
    createdInRange: db.communities.filter(inRangeOf(range)).length,
    byCategory: toMap(countBy(active, 'category')),
    largest: largest.map((c) => ({ id: c._id, name: c.name, slug: c.slug, members: c.memberCount })),
    mostActive,
  };
}

function messagingStats(range) {
  const messages = db.messages.filter(inRangeOf(range));
  const activeConversations = new Set(messages.map((m) => String(m.conversation))).size;
  const senders = new Set(messages.map((m) => String(m.sender))).size;
  return {
    messages: messages.length,
    activeConversations,
    activeSenders: senders,
    averagePerConversation: round(activeConversations ? messages.length / activeConversations : 0),
    totalConversations: db.conversations.filter((c) => c.lastMessage?.createdAt !== undefined).length,
    series: timeSeries(db.messages, range),
  };
}

function moderationStats(range) {
  const reports = db.reports.filter(inRangeOf(range));
  const status = toMap(countBy(reports, 'status'));
  const resolvedTimes = reports.filter((r) => r.resolvedAt != null).map((r) => time(r.resolvedAt) - time(r.createdAt));
  const avgMs = resolvedTimes.length ? resolvedTimes.reduce((a, b) => a + b, 0) / resolvedTimes.length : 0;
  const accountStatus = toMap(countBy(db.users, 'status'));
  return {
    received: reports.length,
    resolved: status.resolved ?? 0,
    dismissed: status.dismissed ?? 0,
    pending: status.open ?? 0,
    openNow: db.reports.filter((r) => r.status === REPORT_STATUS.OPEN).length,
    averageResolutionHours: round(avgMs / 3_600_000),
    byReason: toMap(countBy(reports, 'reason')),
    byTargetType: toMap(countBy(reports, 'targetType')),
    actionsTaken: toMap(countBy(reports.filter((r) => r.status === REPORT_STATUS.RESOLVED), 'action')),
    postsModerated: db.posts.filter((p) => inRangeOf(range)(p) && p.status !== CONTENT_STATUS.VISIBLE && p.moderatedBy != null).length,
    suspendedAccounts: accountStatus.suspended ?? 0,
    bannedAccounts: accountStatus.banned ?? 0,
    series: timeSeries(db.reports, range),
  };
}

function marketplaceStats(range) {
  const created = db.listings.filter(inRangeOf(range)).length;
  const sold = db.listings.filter(inRangeOf(range, 'soldAt')).length;
  const active = db.listings.filter((l) => l.status === LISTING_STATUS.ACTIVE);
  const prices = active.map((l) => l.price).filter((p) => typeof p === 'number');
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  return {
    created,
    sold,
    activeNow: active.length,
    sellThroughRate: round(created ? (sold / created) * 100 : 0),
    averagePrice: Math.round(avg),
    byCategory: toMap(countBy(active, 'category')),
    series: timeSeries(db.listings, range),
  };
}

const popularStats = () => ({ interests: topValues('interests'), skills: topValues('skills'), goals: topValues('goals') });

const SECTIONS = {
  users: userStats,
  engagement: engagementStats,
  connections: connectionStats,
  communities: communityStats,
  messaging: messagingStats,
  moderation: moderationStats,
  marketplace: marketplaceStats,
  popular: popularStats,
};

function buildReport(range, sections = Object.keys(SECTIONS)) {
  return {
    range: { from: range.from, to: range.to, interval: range.interval },
    generatedAt: new Date(),
    ...Object.fromEntries(sections.map((s) => [s, SECTIONS[s](range)])),
  };
}

/* ------------------------------ CSV (services/csv.js) ------------------------------ */

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows) => rows.map((row) => row.map(cell).join(',')).join('\r\n');
const mapRows = (obj) => Object.entries(obj ?? {}).map(([k, v]) => [k, v]);

function reportTables(report) {
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
    ]);
    add('Connections: by source', ['Source', 'Requests'], mapRows(c.bySource));
    add('Connections: requests over time', ['Period starting', 'Requests'], c.series.map((r) => [r.date, r.count]));
  }
  if (cm) {
    add('Communities: by status', ['Status', 'Communities'], mapRows(cm.byStatus));
    add('Communities: active by category', ['Category', 'Communities'], mapRows(cm.byCategory));
    add('Communities: largest', ['Community', 'Members'], cm.largest.map((r) => [r.name, r.members]));
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

function reportToCsv(report) {
  const rows = [
    ['SunuCampus usage report'],
    ['From', report.range.from.toISOString().slice(0, 10), 'To', report.range.to.toISOString().slice(0, 10)],
    ['Generated', report.generatedAt.toISOString()],
  ];
  for (const table of reportTables(report)) rows.push([], [table.title], table.columns, ...table.rows);
  return toCsv(rows);
}

/* ------------------------------ Stats controllers ------------------------------ */

const sectionsFrom = (section) => (section && section !== 'all' ? [section] : undefined);
/** Dates become ISO strings and undefined keys disappear, as with res.json. */
const asJSON = (value) => JSON.parse(JSON.stringify(value));

function statsReport(ctx) {
  const { from, to, interval, section } = vQuery(statsQuery, ctx);
  return asJSON(buildReport(buildRange({ from, to, interval }), sectionsFrom(section)));
}

function statsExport(ctx) {
  const { from, to, interval, section } = vQuery(statsQuery, ctx);
  const range = buildRange({ from, to, interval });
  const data = buildReport(range, sectionsFrom(section));
  const filename = `sunucampus-${section ?? 'all'}-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv`;
  recordAudit(ctx.me, 'report.exported', 'User', ctx.me._id, { section: section ?? 'all', from: range.from.toISOString(), to: range.to.toISOString() });
  // BOM so Excel opens the file as UTF-8.
  return { filename, content: `﻿${reportToCsv(data)}`, type: 'text/csv' };
}

/* ------------------------------ Routes ------------------------------ */

const admin = { roles: ['admin'] };

register([
  ['GET', '/admin/overview', overview, admin],

  ['GET', '/admin/users', listUsers, admin],
  ['GET', '/admin/users/:id', getUser, admin],
  ['PATCH', '/admin/users/:id/role', updateRole, admin],
  ['PATCH', '/admin/users/:id/status', updateStatus, admin],
  ['POST', '/admin/users/:id/warn', warn, admin],

  ['GET', '/admin/reports', listReports, admin],
  ['PATCH', '/admin/reports/:id', resolveReport, admin],

  ['GET', '/admin/posts', listPosts, admin],
  ['PATCH', '/admin/posts/:id/status', updatePostStatus, admin],
  ['PATCH', '/admin/comments/:id/status', updateCommentStatus, admin],

  ['GET', '/admin/communities', listCommunities, admin],
  ['PATCH', '/admin/communities/:id/status', updateCommunityStatus, admin],

  ['GET', '/admin/audit-logs', listAuditLogs, admin],

  ['GET', '/admin/stats', statsReport, admin],
  ['GET', '/admin/stats/export', statsExport, admin],
]);
