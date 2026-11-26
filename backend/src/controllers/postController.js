import { Post, Comment, CONTENT_STATUS } from '../models/Post.js';
import { Community, COMMUNITY_STATUS } from '../models/Community.js';
import { ApiError } from '../utils/ApiError.js';
import { canModerateCommunity, canPostInCommunity, isAdmin } from '../services/permissions.js';
import { loadCommunity } from './communityController.js';
import { connectedUserIds } from '../services/connections.js';
import { notify } from '../services/notifications.js';
import { FeedDismissal } from '../models/FeedDismissal.js';
import { buildFeed, buildTrending, eligiblePosts, rankingVisibility } from '../services/feedRanking.js';
import { randomUUID } from 'node:crypto';
import { User } from '../models/User.js';
import { ACCOUNT_STATUS } from '../config/roles.js';

const AUTHOR_FIELDS = 'name avatarUrl programme yearOfStudy role emailVerifiedAt';
const COMMUNITY_FIELDS = 'name slug moderators status';
export const READABLE_COMMUNITY = [COMMUNITY_STATUS.ACTIVE, COMMUNITY_STATUS.ARCHIVED];

export const POPULATE = [
  { path: 'author', select: AUTHOR_FIELDS },
  { path: 'community', select: COMMUNITY_FIELDS },
];

const authorJSON = (a) =>
  a ? { id: a.id, name: a.name, avatarUrl: a.avatarUrl, programme: a.programme, yearOfStudy: a.yearOfStudy, role: a.role, isVerified: Boolean(a.emailVerifiedAt) } : null;

const isOwn = (doc, viewer) => Boolean(doc.author?._id?.equals(viewer._id));

/** Can the viewer moderate content attached to this (populated) post? */
const moderates = (viewer, post) =>
  isAdmin(viewer) || (post.community instanceof Community && canModerateCommunity(viewer, post.community));

/** Shapes a populated post for the viewer: no raw likes list, plus what the viewer may do. */
export function serializePost(post, viewer) {
  const community = post.community instanceof Community ? post.community : null;
  return {
    id: post.id,
    content: post.content,
    author: authorJSON(post.author),
    community: community && { id: community.id, name: community.name, slug: community.slug },
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByMe: post.likes.some((id) => id.equals(viewer._id)),
    pinned: post.pinned,
    createdAt: post.createdAt,
    isAuthor: isOwn(post, viewer),
    canDelete: isOwn(post, viewer) || moderates(viewer, post),
    canPin: Boolean(community) && moderates(viewer, post),
  };
}

/** Loads a visible post the viewer may see, with author and community populated. */
async function loadPost(id, viewer) {
  const post = await Post.findById(id).populate(POPULATE);
  if (!post || post.status !== CONTENT_STATUS.VISIBLE) throw ApiError.notFound('Post not found');
  if (post.community && !READABLE_COMMUNITY.includes(post.community.status) && !isAdmin(viewer)) {
    throw ApiError.notFound('Post not found');
  }
  return post;
}

const assertNotArchived = (post) => {
  if (post.community?.status === COMMUNITY_STATUS.ARCHIVED) throw ApiError.badRequest('This community is archived');
};

const pageInfo = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
const snapshots = new Map();
const expiryMs = 15 * 60_000;

async function rankedFeed(req, res) {
  const { rank, window, snapshot, page, limit } = req.validated.query;
  const viewer = req.user;
  const key = [viewer.id, rank, window].join(':');
  const now = Date.now();
  const visibility = await rankingVisibility(viewer);
  let id = snapshot;
  let state = snapshots.get(id);
  if (snapshot && (!state || state.key !== key || state.expires <= now)) {
    throw ApiError.conflict('This feed has expired. Refresh to reload it.');
  }
  if (!state) {
    const result = rank === 'trending' ? await buildTrending(viewer, visibility, now, window) : await buildFeed(viewer, visibility, now);
    id = randomUUID();
    state = { ...result, key, expires: now + expiryMs };
    if (snapshots.size >= 500) snapshots.delete(snapshots.keys().next().value);
    snapshots.set(id, state);
  }

  const ids = state.ids.slice((page - 1) * limit, page * limit);
  const highlights = page === 1 ? state.highlights : [];
  const selected = [...new Set([...ids, ...highlights.map((row) => row.id)])];
  // Keep original slots stable but recheck visibility and preferences on every page.
  const candidates = await Post.find({ ...visibility.filter, _id: { $in: selected } });
  const { posts } = await eligiblePosts(viewer, candidates);
  const pageIds = new Set(ids);
  const pagePosts = posts.filter((post) => pageIds.has(post.id));
  const evaluation = {
    served: pagePosts.length,
    uniqueAuthors: new Set(pagePosts.map((post) => String(post.author))).size,
    discovery: pagePosts.filter((post) => state.discoveryIds?.has(post.id)).length,
  };
  await Post.populate(posts, POPULATE);
  const mapped = new Map(posts.map((post) => [post.id, serializePost(post, viewer)]));
  res.json({
    posts: ids.map((post) => mapped.get(post)).filter(Boolean),
    highlights: highlights.filter((row) => mapped.has(row.id)).map((row) => ({ post: mapped.get(row.id), reason: row.reason })),
    snapshot: id,
    evaluation,
    ...pageInfo(page, limit, state.ids.length),
  });
}

export async function dismiss(req, res) {
  const post = await loadPost(req.params.id, req.user);
  const filter = { viewer: req.user._id, post: post._id };
  await FeedDismissal.updateOne(filter, { $setOnInsert: filter }, { upsert: true }).catch((error) => {
    if (error.code !== 11000) throw error;
  });
  res.status(204).end();
}

export async function create(req, res) {
  const { content, community: communityId } = req.body;
  let community;
  if (communityId) {
    community = await loadCommunity(communityId, req.user);
    if (!canPostInCommunity(req.user, community)) throw ApiError.forbidden('Join this community to post in it');
  }

  const post = await Post.create({ author: req.user._id, community: community?._id, content });
  await post.populate(POPULATE);
  res.status(201).json({ post: serializePost(post, req.user) });
}

export async function feed(req, res) {
  const { community: communityId, author, scope, page, limit } = req.validated.query;
  if (req.validated.query.rank && scope !== 'friends' && !communityId && !author) return rankedFeed(req, res);
  const me = req.user;
  const filter = { status: CONTENT_STATUS.VISIBLE };
  let sort = { createdAt: -1, _id: -1 };

  if (communityId) {
    // A community's own page; pinned posts first.
    const community = await loadCommunity(communityId, me);
    filter.community = community._id;
    sort = { pinned: -1, ...sort };
  } else if (author) {
    // A student's profile: campus-wide posts and posts in publicly readable communities.
    const readable = await Community.find({ status: { $in: READABLE_COMMUNITY } }).distinct('_id');
    filter.$or = [{ community: null }, { community: { $in: readable } }];
  } else if (scope === 'friends') {
    const [{ filter: allowed }, connections] = await Promise.all([rankingVisibility(me), connectedUserIds(me._id)]);
    const authors = await User.distinct('_id', {
      _id: { $in: [me._id, ...connections], $nin: allowed.author.$nin },
      status: ACCOUNT_STATUS.ACTIVE,
    });
    filter.author = { $in: authors };
    filter.$or = allowed.$or;
  } else if (scope === 'foryou') {
    // "For you": posts from my connections and me, plus posts in my communities.
    const [mine, people] = await Promise.all([
      Community.find({ members: me._id, status: { $in: READABLE_COMMUNITY } }).distinct('_id'),
      connectedUserIds(me._id),
    ]);
    filter.$or = [{ author: { $in: [me._id, ...people] }, community: null }, { community: { $in: mine } }];
  } else if (scope === 'campus') {
    // "Campus": everything public, i.e. campus-wide posts and posts in active communities.
    const readable = await Community.find({ status: { $in: READABLE_COMMUNITY } }).distinct('_id');
    filter.$or = [{ community: null }, { community: { $in: readable } }];
  } else {
    // Default feed: campus-wide posts plus posts from the viewer's communities.
    const mine = await Community.find({ members: me._id, status: { $in: READABLE_COMMUNITY } }).distinct('_id');
    filter.$or = [{ community: null }, { community: { $in: mine } }];
  }
  if (author) filter.author = author;

  const [posts, total] = await Promise.all([
    Post.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate(POPULATE),
    Post.countDocuments(filter),
  ]);

  res.json({ posts: posts.map((p) => serializePost(p, me)), ...pageInfo(page, limit, total) });
}

export async function getOne(req, res) {
  const post = await loadPost(req.params.id, req.user);
  res.json({ post: serializePost(post, req.user) });
}

export async function remove(req, res) {
  const post = await loadPost(req.params.id, req.user);
  const own = isOwn(post, req.user);
  if (!own && !moderates(req.user, post)) throw ApiError.forbidden('You can only delete your own posts');

  post.status = CONTENT_STATUS.REMOVED;
  if (!own) post.moderatedBy = req.user._id;
  await post.save();
  res.status(204).end();
}

export async function setPinned(req, res) {
  const post = await loadPost(req.params.id, req.user);
  if (!post.community || !moderates(req.user, post)) throw ApiError.forbidden('Only community moderators can pin posts');
  post.pinned = req.body.pinned;
  await post.save();
  res.json({ post: serializePost(post, req.user) });
}

export async function like(req, res) {
  const post = await loadPost(req.params.id, req.user);
  assertNotArchived(post);
  // Atomic and idempotent: a student can only like a post once.
  const now = new Date();
  const { modifiedCount } = await Post.updateOne(
    { _id: post._id, likes: { $ne: req.user._id } },
    { $push: { likes: req.user._id }, $inc: { likeCount: 1 }, $set: { [`likeTimes.${req.user.id}`]: now }, $max: { lastLikedAt: now } },
  );
  if (modifiedCount) await notify({ recipient: post.author?._id, actor: req.user._id, type: 'like', post: post._id });
  const { likeCount } = await Post.findById(post._id, 'likeCount');
  res.json({ likeCount, likedByMe: true });
}

export async function unlike(req, res) {
  const post = await loadPost(req.params.id, req.user);
  await Post.updateOne({ _id: post._id, likes: req.user._id }, {
    $pull: { likes: req.user._id }, $inc: { likeCount: -1 }, $unset: { [`likeTimes.${req.user.id}`]: 1 },
  });
  const { likeCount } = await Post.findById(post._id, 'likeCount');
  res.json({ likeCount, likedByMe: false });
}

function serializeComment(comment, viewer, post) {
  return {
    id: comment.id,
    content: comment.content,
    author: authorJSON(comment.author),
    createdAt: comment.createdAt,
    canDelete: isOwn(comment, viewer) || moderates(viewer, post),
  };
}

export async function listComments(req, res) {
  const post = await loadPost(req.params.id, req.user);
  const comments = await Comment.find({ post: post._id, status: CONTENT_STATUS.VISIBLE })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate('author', AUTHOR_FIELDS);
  res.json({ comments: comments.map((c) => serializeComment(c, req.user, post)) });
}

export async function addComment(req, res) {
  const post = await loadPost(req.params.id, req.user);
  assertNotArchived(post);
  const comment = await Comment.create({ post: post._id, author: req.user._id, content: req.body.content });
  await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
  await comment.populate('author', AUTHOR_FIELDS);
  await notify({ recipient: post.author?._id, actor: req.user._id, type: 'comment', post: post._id, text: comment.content.slice(0, 140) });
  res.status(201).json({ comment: serializeComment(comment, req.user, post) });
}

export async function removeComment(req, res) {
  const comment = await Comment.findById(req.params.commentId).populate('author', AUTHOR_FIELDS);
  if (!comment || comment.status !== CONTENT_STATUS.VISIBLE || !comment.post.equals(req.params.id)) {
    throw ApiError.notFound('Comment not found');
  }
  const post = await loadPost(comment.post, req.user);
  const own = isOwn(comment, req.user);
  if (!own && !moderates(req.user, post)) throw ApiError.forbidden('You can only delete your own comments');

  comment.status = CONTENT_STATUS.REMOVED;
  if (!own) comment.moderatedBy = req.user._id;
  await comment.save();
  await Post.updateOne({ _id: post._id }, { $inc: { commentCount: -1 } });
  res.status(204).end();
}
