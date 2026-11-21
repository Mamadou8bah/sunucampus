import { Report, REPORT_STATUS } from '../models/Report.js';
import { Post, Comment, CONTENT_STATUS } from '../models/Post.js';
import { Listing, LISTING_STATUS } from '../models/Listing.js';
import { Community, COMMUNITY_STATUS } from '../models/Community.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { ROLES, ACCOUNT_STATUS } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../utils/audit.js';
import { disconnectUser } from '../realtime/socket.js';
import { notify } from '../services/notifications.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageInfo = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
const userSummary = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status };
const USER_FIELDS = 'name email role status';

/* ------------------------------ Reports queue ------------------------------ */

/** Loads a short description of whatever was reported, for the moderation queue. */
async function describeTarget(type, id) {
  switch (type) {
    case 'post': {
      const p = await Post.findById(id).populate('author', USER_FIELDS).populate('community', 'name slug');
      return p && { id: p.id, content: p.content, status: p.status, author: userSummary(p.author), community: p.community && { name: p.community.name, slug: p.community.slug }, createdAt: p.createdAt };
    }
    case 'comment': {
      const c = await Comment.findById(id).populate('author', USER_FIELDS);
      return c && { id: c.id, content: c.content, status: c.status, author: userSummary(c.author), postId: c.post.toString(), createdAt: c.createdAt };
    }
    case 'community': {
      const c = await Community.findById(id).populate('creator', USER_FIELDS);
      return c && { id: c.id, name: c.name, slug: c.slug, description: c.description, status: c.status, author: userSummary(c.creator) };
    }
    case 'user': {
      const u = await User.findById(id);
      return u && { id: u.id, name: u.name, bio: u.bio, status: u.status, author: userSummary(u) };
    }
    case 'listing': {
      const l = await Listing.findById(id).populate('seller', USER_FIELDS);
      return l && { id: l.id, name: `${l.title} (D${l.price})`, content: l.description, photo: l.photos[0], status: l.status, author: userSummary(l.seller) };
    }
    default:
      return null;
  }
}

export async function listReports(req, res) {
  const { status, targetType, page, limit } = req.validated.query;
  const filter = {};
  if (status) filter.status = status;
  if (targetType) filter.targetType = targetType;

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('reporter', 'name email')
      .populate('resolvedBy', 'name'),
    Report.countDocuments(filter),
  ]);

  const items = await Promise.all(
    reports.map(async (r) => ({
      ...r.toJSON(),
      reporter: r.reporter && { id: r.reporter.id, name: r.reporter.name, email: r.reporter.email },
      resolvedBy: r.resolvedBy && { id: r.resolvedBy.id, name: r.resolvedBy.name },
      target: await describeTarget(r.targetType, r.targetId),
      // How many students reported the same item and are still waiting.
      openReportsOnTarget: await Report.countDocuments({ targetType: r.targetType, targetId: r.targetId, status: REPORT_STATUS.OPEN }),
    })),
  );

  res.json({ reports: items, ...pageInfo(page, limit, total) });
}

/** Finds the user responsible for a reported item. */
async function responsibleUserId(type, id) {
  if (type === 'user') return id;
  if (type === 'community') return (await Community.findById(id, 'creator'))?.creator;
  if (type === 'listing') return (await Listing.findById(id, 'seller'))?.seller;
  const model = type === 'post' ? Post : Comment;
  return (await model.findById(id, 'author'))?.author;
}

async function setAccountStatus(admin, userId, status, reason) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('The responsible user no longer exists');
  if (user.role === ROLES.ADMIN) throw ApiError.badRequest('Administrators cannot be suspended from the reports queue');
  if (user.status === status) return;
  const previous = user.status;
  user.status = status;
  user.statusReason = reason;
  await user.save();
  disconnectUser(user._id);
  await recordAudit(admin, 'user.status_changed', 'User', user._id, { from: previous, to: status, reason, via: 'report' });
}

async function setContentStatus(admin, type, id, status, reason) {
  const model = type === 'post' ? Post : Comment;
  const doc = await model.findById(id);
  if (!doc) throw ApiError.notFound('Content not found');
  if (doc.status === status) return doc;
  const previous = doc.status;
  doc.status = status;
  doc.moderatedBy = admin._id;
  if (type === 'post') doc.moderationReason = reason;
  await doc.save();

  // Keep the post's comment counter in step with visible comments.
  if (type === 'comment') {
    const delta = (status === CONTENT_STATUS.VISIBLE ? 1 : 0) - (previous === CONTENT_STATUS.VISIBLE ? 1 : 0);
    if (delta) await Post.updateOne({ _id: doc.post }, { $inc: { commentCount: delta } });
  }
  await recordAudit(admin, `${type}.status_changed`, type === 'post' ? 'Post' : 'Comment', doc._id, { from: previous, to: status, reason });
  if (status !== CONTENT_STATUS.VISIBLE) {
    await notify({ recipient: doc.author, type: 'content_moderated', subject: type, text: reason });
  }
  return doc;
}

async function setListingStatus(admin, id, status, reason) {
  const listing = await Listing.findById(id);
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.status === status) return;
  const previous = listing.status;
  listing.status = status;
  listing.moderatedBy = admin._id;
  await listing.save();
  await recordAudit(admin, 'listing.status_changed', 'Listing', listing._id, { from: previous, to: status, reason, name: listing.title });
  if ([LISTING_STATUS.HIDDEN, LISTING_STATUS.REMOVED].includes(status)) {
    await notify({ recipient: listing.seller, type: 'content_moderated', subject: 'listing', text: reason });
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
export const defaultWarning = (reason) =>
  `Students reported you for ${REASON_TEXT[reason] ?? REASON_TEXT.other}. Please follow the SunuCampus guidelines. Further reports may lead to your account being suspended.`;

/** Records a warning on the account and tells the student straight away. */
export async function warnUser(admin, userId, message, details = {}) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('The responsible user no longer exists');
  if (user.role === ROLES.ADMIN) throw ApiError.badRequest('Administrators cannot be warned');
  user.warningCount = (user.warningCount ?? 0) + 1;
  user.lastWarnedAt = new Date();
  await user.save();
  await recordAudit(admin, 'user.warned', 'User', user._id, { message, ...details });
  await notify({ recipient: user._id, type: 'warning', text: message, subject: details.targetType });
  return user;
}

export async function resolveReport(req, res) {
  const report = await Report.findById(req.params.id);
  if (!report) throw ApiError.notFound('Report not found');
  if (report.status !== REPORT_STATUS.OPEN) throw ApiError.conflict('This report has already been handled');

  const { status, action, note } = req.body;
  const { targetType, targetId } = report;
  const reason = note || `Reported for ${report.reason}`;

  const contentActions = ['content_hidden', 'content_removed'];
  if (contentActions.includes(action) && !['post', 'comment', 'listing'].includes(targetType)) {
    throw ApiError.badRequest('Only posts, comments and listings can be hidden or removed');
  }
  if (action === 'community_archived' && targetType !== 'community') {
    throw ApiError.badRequest('Only communities can be archived');
  }

  switch (action) {
    case 'content_hidden':
    case 'content_removed': {
      const hide = action === 'content_hidden';
      if (targetType === 'listing') await setListingStatus(req.user, targetId, hide ? LISTING_STATUS.HIDDEN : LISTING_STATUS.REMOVED, reason);
      else await setContentStatus(req.user, targetType, targetId, hide ? CONTENT_STATUS.HIDDEN : CONTENT_STATUS.REMOVED, reason);
      break;
    }
    case 'user_suspended':
    case 'user_banned':
      await setAccountStatus(
        req.user,
        await responsibleUserId(targetType, targetId),
        action === 'user_banned' ? ACCOUNT_STATUS.BANNED : ACCOUNT_STATUS.SUSPENDED,
        reason,
      );
      break;
    case 'user_warned':
      await warnUser(req.user, await responsibleUserId(targetType, targetId), note || defaultWarning(report.reason), { targetType, targetId, via: 'report' });
      break;
    case 'community_archived':
      await Community.updateOne({ _id: targetId }, { status: COMMUNITY_STATUS.ARCHIVED, statusReason: reason });
      await recordAudit(req.user, 'community.status_changed', 'Community', targetId, { to: COMMUNITY_STATUS.ARCHIVED, reason });
      break;
    default:
      break;
  }

  // Every open report about the same item is closed with the same outcome.
  const resolution = { status, action, resolutionNote: note, resolvedBy: req.user._id, resolvedAt: new Date() };
  const { modifiedCount } = await Report.updateMany({ targetType, targetId, status: REPORT_STATUS.OPEN }, resolution);
  await recordAudit(req.user, `report.${status}`, 'Report', report._id, { action, targetType, targetId, closedReports: modifiedCount });

  res.json({ report: { ...report.toJSON(), ...resolution }, closedReports: modifiedCount });
}

/* ------------------------------ Posts and comments ------------------------------ */

export async function listPosts(req, res) {
  const { status, reported, q, page, limit } = req.validated.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.content = new RegExp(escapeRegex(q), 'i');
  if (reported === 'true') {
    filter._id = { $in: await Report.distinct('targetId', { targetType: 'post', status: REPORT_STATUS.OPEN }) };
  }

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author', USER_FIELDS)
      .populate('community', 'name slug')
      .populate('moderatedBy', 'name'),
    Post.countDocuments(filter),
  ]);

  const reportCounts = new Map(
    (
      await Report.aggregate([
        { $match: { targetType: 'post', status: REPORT_STATUS.OPEN, targetId: { $in: posts.map((p) => p._id) } } },
        { $group: { _id: '$targetId', count: { $sum: 1 } } },
      ])
    ).map((r) => [r._id.toString(), r.count]),
  );

  res.json({
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      status: p.status,
      author: userSummary(p.author),
      community: p.community && { name: p.community.name, slug: p.community.slug },
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      moderatedBy: p.moderatedBy && { name: p.moderatedBy.name },
      moderationReason: p.moderationReason,
      openReports: reportCounts.get(p.id) ?? 0,
      createdAt: p.createdAt,
    })),
    ...pageInfo(page, limit, total),
  });
}

export async function updatePostStatus(req, res) {
  const post = await setContentStatus(req.user, 'post', req.params.id, req.body.status, req.body.reason);
  res.json({ post: { id: post.id, status: post.status } });
}

export async function updateCommentStatus(req, res) {
  const comment = await setContentStatus(req.user, 'comment', req.params.id, req.body.status, req.body.reason);
  res.json({ comment: { id: comment.id, status: comment.status } });
}

/* ------------------------------ Communities ------------------------------ */

export async function listCommunities(req, res) {
  const { status, q, page, limit } = req.validated.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.name = new RegExp(escapeRegex(q), 'i');

  const [communities, total] = await Promise.all([
    Community.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('creator', USER_FIELDS)
      .populate('reviewedBy', 'name'),
    Community.countDocuments(filter),
  ]);

  res.json({
    communities: communities.map((c) => ({
      ...c.toJSON(),
      creator: userSummary(c.creator),
      reviewedBy: c.reviewedBy && { name: c.reviewedBy.name },
      moderators: undefined,
    })),
    ...pageInfo(page, limit, total),
  });
}

export async function updateCommunityStatus(req, res) {
  const community = await Community.findById(req.params.id);
  if (!community) throw ApiError.notFound('Community not found');

  const { status, reason } = req.body;
  const previous = community.status;
  if (previous === status) return res.json({ community });

  community.status = status;
  community.statusReason = status === COMMUNITY_STATUS.ACTIVE ? undefined : reason;
  community.reviewedBy = req.user._id;
  community.reviewedAt = new Date();
  await community.save();

  // The creator of an approved community becomes a community moderator (docs/PROPOSAL.md §4.2).
  if (status === COMMUNITY_STATUS.ACTIVE) {
    await User.updateOne({ _id: community.creator, role: ROLES.STUDENT }, { role: ROLES.MODERATOR });
  }
  await recordAudit(req.user, 'community.status_changed', 'Community', community._id, { from: previous, to: status, reason, name: community.name });
  if (previous === COMMUNITY_STATUS.PENDING && [COMMUNITY_STATUS.ACTIVE, COMMUNITY_STATUS.REJECTED].includes(status)) {
    await notify({
      recipient: community.creator,
      type: status === COMMUNITY_STATUS.ACTIVE ? 'community_approved' : 'community_rejected',
      community: community._id,
      text: status === COMMUNITY_STATUS.REJECTED ? reason : undefined,
    });
  }
  res.json({ community });
}

/* ------------------------------ Overview ------------------------------ */

export async function overview(_req, res) {
  const now = Date.now();
  const day = new Date(now - 86_400_000);
  const week = new Date(now - 7 * 86_400_000);

  const [
    totalUsers,
    newUsersWeek,
    activeWeek,
    suspended,
    postsTotal,
    postsDay,
    pendingCommunities,
    activeCommunities,
    openReports,
    recentUsers,
    recentActions,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: week } }),
    User.countDocuments({ lastActiveAt: { $gte: week } }),
    User.countDocuments({ status: { $ne: ACCOUNT_STATUS.ACTIVE } }),
    Post.countDocuments({ status: CONTENT_STATUS.VISIBLE }),
    Post.countDocuments({ createdAt: { $gte: day } }),
    Community.countDocuments({ status: COMMUNITY_STATUS.PENDING }),
    Community.countDocuments({ status: COMMUNITY_STATUS.ACTIVE }),
    Report.countDocuments({ status: REPORT_STATUS.OPEN }),
    User.find().sort({ createdAt: -1 }).limit(5),
    AuditLog.find().sort({ createdAt: -1 }).limit(6).populate('actor', 'name'),
  ]);

  res.json({
    counts: { totalUsers, newUsersWeek, activeWeek, suspended, postsTotal, postsDay, pendingCommunities, activeCommunities, openReports },
    recentUsers: recentUsers.map((u) => ({ id: u.id, name: u.name, email: u.email, programme: u.programme, createdAt: u.createdAt })),
    recentActions,
  });
}
