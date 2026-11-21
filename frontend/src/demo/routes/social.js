// Demo port of backend/src/routes/social.js: connections, communities and posts/comments.
// Mirrors controllers/{connectionController,communityController,postController}.js.
import { z } from 'zod';
import {
  badRequest,
  byId,
  cleanJSON,
  conflict,
  db,
  findAll,
  findOne,
  forbidden,
  insert,
  notFound,
  nowISO,
  register,
  remove as removeDoc,
  respond,
  sameId,
  update,
  validate,
} from '../core.js';
import {
  canModerateCommunity,
  canPostInCommunity,
  canViewCommunity,
  connectedUserIds,
  isAdmin,
  isCommunityMember,
  isCommunityModerator,
  notify,
  pairKeyOf,
  relationFor,
} from '../shared.js';

/* ------------------------------ Constants & validators ------------------------------ */

const CONNECTION_SOURCES = ['match', 'discover', 'profile'];
const COMMUNITY_CATEGORIES = ['technology', 'entrepreneurship', 'sports', 'research', 'photography', 'arts', 'academic', 'culture', 'volunteering', 'other'];
const READABLE_COMMUNITY = ['active', 'archived'];

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const sendRequestSchema = z.object({
  recipientId: objectId,
  source: z.enum(CONNECTION_SOURCES).default('profile'),
});
const respondSchema = z.object({ action: z.enum(['accept', 'reject']) });

const page = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

const createPostSchema = z.object({
  content: z.string().trim().min(1, 'Write something first').max(2000, 'Posts can be at most 2000 characters'),
  community: objectId.optional(),
});
const feedQuery = z.object({
  community: objectId.optional(),
  author: objectId.optional(),
  scope: z.enum(['foryou', 'campus']).optional(),
  ...page,
});
const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Write a comment first').max(1000, 'Comments can be at most 1000 characters'),
});
const pinSchema = z.object({ pinned: z.boolean() });
const createCommunitySchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(60),
  category: z.enum(COMMUNITY_CATEGORIES),
  description: z.string().trim().max(1000).optional(),
});
const updateCommunitySchema = z
  .object({
    description: z.string().trim().max(1000).optional(),
    category: z.enum(COMMUNITY_CATEGORIES).optional(),
  })
  .strict();
const communitiesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(COMMUNITY_CATEGORIES).optional(),
  mine: z.enum(['true', 'false']).optional(),
  ...page,
});
const moderatorSchema = z.object({ userId: objectId });

/* ------------------------------ Helpers ------------------------------ */

const isObjectId = (s) => /^[a-f\d]{24}$/i.test(String(s));
const desc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
const pageInfo = (pg, limit, total) => ({ page: pg, limit, total, totalPages: Math.ceil(total / limit) || 1 });
const paginate = (rows, pg, limit) => rows.slice((pg - 1) * limit, (pg - 1) * limit + limit);

/** Same JSON as a mongoose doc with toJSON (undefined fields dropped). */
const docJSON = (doc) => JSON.parse(JSON.stringify(cleanJSON(doc)));

/* ------------------------------ Connections ------------------------------ */

const connectionUser = (u) => ({
  id: u._id,
  name: u.name,
  role: u.role,
  programme: u.programme,
  yearOfStudy: u.yearOfStudy,
  avatarUrl: u.avatarUrl,
  interests: u.interests,
  skills: u.skills,
  goals: u.goals,
  isVerified: Boolean(u.emailVerifiedAt),
});

function sendRequest({ me, body }) {
  const { recipientId, source } = validate(sendRequestSchema, body);
  if (recipientId === me._id) throw badRequest('You cannot connect with yourself');

  const recipient = byId('users', recipientId);
  if (!recipient || recipient.status !== 'active' || recipient.role === 'admin') throw notFound('User not found');

  const existing = findOne('connections', (c) => c.pairKey === pairKeyOf(me._id, recipient._id));
  if (!existing) {
    const connection = insert('connections', {
      requester: me._id,
      recipient: recipient._id,
      pairKey: pairKeyOf(me._id, recipient._id),
      status: 'pending',
      source,
    });
    notify({ recipient: recipient._id, actor: me._id, type: 'connection_request' });
    return respond(201, { connection: docJSON(connection), relation: relationFor(connection, me._id) });
  }

  const relation = relationFor(existing, me._id);
  switch (relation.status) {
    case 'connected':
      throw conflict('You are already connected');
    case 'pending_outgoing':
      throw conflict('You already sent a request');
    case 'declined':
      throw conflict('You can’t send another request to this student yet');
    case 'pending_incoming':
      // They already asked me: sending back counts as accepting.
      update(existing, { status: 'accepted', respondedAt: nowISO() });
      break;
    default:
      // A previous request was declined and may be sent again.
      update(existing, { requester: me._id, recipient: recipient._id, status: 'pending', source });
      delete existing.respondedAt;
  }
  notify({
    recipient: recipient._id,
    actor: me._id,
    type: existing.status === 'accepted' ? 'connection_accepted' : 'connection_request',
  });
  return { connection: docJSON(existing), relation: relationFor(existing, me._id) };
}

function respondToRequest({ me, params, body }) {
  const { action } = validate(respondSchema, body);
  const connection = byId('connections', params.id);
  if (!connection || !sameId(connection.recipient, me._id)) throw notFound('Request not found');
  if (connection.status !== 'pending') throw conflict('This request has already been answered');

  update(connection, { status: action === 'accept' ? 'accepted' : 'rejected', respondedAt: nowISO() });
  if (connection.status === 'accepted') {
    notify({ recipient: connection.requester, actor: me._id, type: 'connection_accepted' });
  }
  return { connection: docJSON(connection), relation: relationFor(connection, me._id) };
}

function removeConnection({ me, params }) {
  const connection = byId('connections', params.id);
  const involved = connection && (sameId(connection.requester, me._id) || sameId(connection.recipient, me._id));
  if (!involved) throw notFound('Connection not found');

  const canCancel = connection.status === 'pending' && sameId(connection.requester, me._id);
  const canRemove = connection.status === 'accepted';
  if (!canCancel && !canRemove) throw badRequest('This connection cannot be removed');

  removeDoc('connections', connection._id);
  return respond(204);
}

function listConnections({ me }) {
  const rows = findAll('connections', (c) => c.status === 'accepted' && (sameId(c.requester, me._id) || sameId(c.recipient, me._id))).sort((a, b) =>
    desc(a.respondedAt ?? '', b.respondedAt ?? ''),
  );
  return {
    connections: rows
      .map((c) => ({ c, other: byId('users', sameId(c.requester, me._id) ? c.recipient : c.requester) }))
      .filter(({ other }) => other)
      .map(({ c, other }) => ({ id: c._id, since: c.respondedAt, user: connectionUser(other) })),
  };
}

function listRequests({ me }) {
  const pending = (field) =>
    findAll('connections', (c) => c.status === 'pending' && sameId(c[field], me._id)).sort((a, b) => desc(a.createdAt, b.createdAt));
  const shape = (rows, otherField) =>
    rows
      .map((c) => ({ c, other: byId('users', c[otherField]) }))
      .filter(({ other }) => other)
      .map(({ c, other }) => ({ id: c._id, createdAt: c.createdAt, user: connectionUser(other) }));
  return {
    incoming: shape(pending('recipient'), 'requester'),
    outgoing: shape(pending('requester'), 'recipient'),
  };
}

/* ------------------------------ Communities ------------------------------ */

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Community.toJSON (no members list) plus the viewer's flags. */
export function serializeCommunity(community, viewer) {
  const { members: _members, ...rest } = docJSON(community);
  return {
    ...rest,
    isMember: isCommunityMember(community, viewer._id),
    canModerate: canModerateCommunity(viewer, community),
  };
}

/** Accepts either an id or a slug in the URL. */
export function loadCommunity(idOrSlug, viewer) {
  const key = String(idOrSlug);
  const community = isObjectId(key) ? byId('communities', key) : findOne('communities', (c) => c.slug === key.toLowerCase());
  if (!community || !canViewCommunity(viewer, community)) throw notFound('Community not found');
  return community;
}

function loadModeratable(ctx) {
  const community = loadCommunity(ctx.params.id, ctx.me);
  if (!canModerateCommunity(ctx.me, community)) throw forbidden('Only this community’s moderators can do that');
  return community;
}

function createCommunity({ me, body }) {
  const { name, category, description } = validate(createCommunitySchema, body);
  const slug = slugify(name);
  if (!slug) throw badRequest('Choose a name with letters or numbers');
  if (db.communities.some((c) => c.slug === slug)) throw conflict('A community with that name already exists');

  const autoApprove = isAdmin(me);
  const community = insert('communities', {
    name,
    slug,
    category,
    ...(description !== undefined && { description }),
    creator: me._id,
    moderators: [me._id],
    members: [me._id],
    memberCount: 1,
    status: autoApprove ? 'active' : 'pending',
    ...(autoApprove && { reviewedBy: me._id, reviewedAt: nowISO() }),
  });
  return respond(201, { community: serializeCommunity(community, me) });
}

function listCommunities({ me, query }) {
  const { q, category, mine, page: pg, limit } = validate(communitiesQuery, query);
  const pattern = q ? new RegExp(escapeRegex(q), 'i') : null;
  const rows = findAll('communities', (c) => {
    const base =
      mine === 'true'
        ? (isCommunityMember(c, me._id) && READABLE_COMMUNITY.includes(c.status)) || sameId(c.creator, me._id)
        : c.status === 'active';
    if (!base) return false;
    if (category && c.category !== category) return false;
    if (pattern && !(pattern.test(c.name ?? '') || pattern.test(c.description ?? ''))) return false;
    return true;
  }).sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    communities: paginate(rows, pg, limit).map((c) => serializeCommunity(c, me)),
    ...pageInfo(pg, limit, rows.length),
  };
}

function getCommunity({ me, params }) {
  const community = loadCommunity(params.id, me);
  const data = serializeCommunity(community, me);
  data.moderators = (community.moderators ?? [])
    .map((id) => byId('users', id))
    .filter(Boolean)
    .map((m) => ({
      id: m._id,
      name: m.name,
      avatarUrl: m.avatarUrl,
      programme: m.programme,
      yearOfStudy: m.yearOfStudy,
      isVerified: Boolean(m.emailVerifiedAt),
    }));
  return { community: data };
}

function updateCommunity(ctx) {
  const changes = validate(updateCommunitySchema, ctx.body);
  const community = loadModeratable(ctx);
  update(community, changes);
  return { community: serializeCommunity(community, ctx.me) };
}

function joinCommunity({ me, params }) {
  const community = loadCommunity(params.id, me);
  if (community.status !== 'active') throw badRequest('This community is not open for new members');
  if (!isCommunityMember(community, me._id)) {
    update(community, { members: [...(community.members ?? []), me._id], memberCount: (community.memberCount ?? 0) + 1 });
  }
  return { community: serializeCommunity(community, me) };
}

function leaveCommunity({ me, params }) {
  const community = loadCommunity(params.id, me);
  const moderators = community.moderators ?? [];
  if (isCommunityModerator(community, me._id) && moderators.length === 1 && community.memberCount > 1) {
    throw badRequest('Appoint another moderator before leaving this community');
  }
  if (isCommunityMember(community, me._id)) {
    update(community, {
      members: community.members.filter((m) => !sameId(m, me._id)),
      moderators: moderators.filter((m) => !sameId(m, me._id)),
      memberCount: (community.memberCount ?? 0) - 1,
    });
  }
  return { community: serializeCommunity(community, me) };
}

function communityMembers({ me, params }) {
  const community = loadCommunity(params.id, me);
  return {
    members: (community.members ?? [])
      .slice(0, 200)
      .map((id) => byId('users', id))
      .filter(Boolean)
      .map((m) => ({
        id: m._id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        programme: m.programme,
        yearOfStudy: m.yearOfStudy,
        isVerified: Boolean(m.emailVerifiedAt),
        isModerator: isCommunityModerator(community, m._id),
      })),
    total: community.memberCount,
  };
}

function addModerator(ctx) {
  const { userId } = validate(moderatorSchema, ctx.body);
  const community = loadModeratable(ctx);
  if (!isCommunityMember(community, userId)) throw badRequest('Only members can be appointed as moderators');

  if (!isCommunityModerator(community, userId)) {
    update(community, { moderators: [...(community.moderators ?? []), userId] });
    // Appointed students gain the platform-wide moderator role.
    const user = byId('users', userId);
    if (user && user.role === 'student') update(user, { role: 'moderator' });
  }
  return { community: serializeCommunity(community, ctx.me) };
}

function removeModerator(ctx) {
  const community = loadModeratable(ctx);
  const { userId } = ctx.params;
  const moderators = community.moderators ?? [];
  if (moderators.length === 1 && isCommunityModerator(community, userId)) {
    throw badRequest('A community needs at least one moderator');
  }
  update(community, { moderators: moderators.filter((m) => !sameId(m, userId)) });
  return { community: serializeCommunity(community, ctx.me) };
}

/* ------------------------------ Posts ------------------------------ */

const authorJSON = (a) =>
  a ? { id: a._id, name: a.name, avatarUrl: a.avatarUrl, programme: a.programme, yearOfStudy: a.yearOfStudy, role: a.role, isVerified: Boolean(a.emailVerifiedAt) } : null;

/** The author only counts as "own" if the user still exists (like a populated author). */
const isOwn = (doc, viewer) => Boolean(byId('users', doc.author) && sameId(doc.author, viewer._id));
const communityOf = (post) => (post.community ? byId('communities', post.community) : null);

/** Can the viewer moderate content attached to this post? */
const moderates = (viewer, post) => {
  if (isAdmin(viewer)) return true;
  const community = communityOf(post);
  return Boolean(community) && canModerateCommunity(viewer, community);
};

export function serializePost(post, viewer) {
  const community = communityOf(post);
  return {
    id: post._id,
    content: post.content,
    author: authorJSON(byId('users', post.author)),
    community: community && { id: community._id, name: community.name, slug: community.slug },
    likeCount: post.likeCount ?? 0,
    commentCount: post.commentCount ?? 0,
    likedByMe: (post.likes ?? []).some((id) => sameId(id, viewer._id)),
    pinned: post.pinned ?? false,
    createdAt: post.createdAt,
    isAuthor: isOwn(post, viewer),
    canDelete: isOwn(post, viewer) || moderates(viewer, post),
    canPin: Boolean(community) && moderates(viewer, post),
  };
}

function loadPost(id, viewer) {
  const post = byId('posts', id);
  if (!post || post.status !== 'visible') throw notFound('Post not found');
  const community = communityOf(post);
  if (community && !READABLE_COMMUNITY.includes(community.status) && !isAdmin(viewer)) throw notFound('Post not found');
  return post;
}

const assertNotArchived = (post) => {
  if (communityOf(post)?.status === 'archived') throw badRequest('This community is archived');
};

function createPost({ me, body }) {
  const { content, community: communityId } = validate(createPostSchema, body);
  let community;
  if (communityId) {
    community = loadCommunity(communityId, me);
    if (!canPostInCommunity(me, community)) throw forbidden('Join this community to post in it');
  }
  const post = insert('posts', {
    author: me._id,
    ...(community && { community: community._id }),
    content,
    likes: [],
    likeCount: 0,
    commentCount: 0,
    pinned: false,
    status: 'visible',
  });
  return respond(201, { post: serializePost(post, me) });
}

function feed({ me, query }) {
  const { community: communityId, author, scope, page: pg, limit } = validate(feedQuery, query);
  const readableIds = () => new Set(db.communities.filter((c) => READABLE_COMMUNITY.includes(c.status)).map((c) => c._id));
  const myIds = () => new Set(db.communities.filter((c) => READABLE_COMMUNITY.includes(c.status) && isCommunityMember(c, me._id)).map((c) => c._id));
  let match;
  let pinnedFirst = false;

  if (communityId) {
    // A community's own page; pinned posts first.
    const community = loadCommunity(communityId, me);
    match = (p) => sameId(p.community, community._id);
    pinnedFirst = true;
  } else if (author || scope === 'campus') {
    // A profile, or "Campus": campus-wide posts and posts in publicly readable communities.
    const readable = readableIds();
    match = (p) => !p.community || readable.has(String(p.community));
  } else if (scope === 'foryou') {
    // "For you": posts from my connections and me, plus posts in my communities.
    const mine = myIds();
    const people = new Set([me._id, ...connectedUserIds(me._id)].map(String));
    match = (p) => (!p.community && people.has(String(p.author))) || (p.community && mine.has(String(p.community)));
  } else {
    // Default feed: campus-wide posts plus posts from the viewer's communities.
    const mine = myIds();
    match = (p) => !p.community || mine.has(String(p.community));
  }

  const rows = findAll('posts', (p) => p.status === 'visible' && match(p) && (!author || sameId(p.author, author))).sort(
    (a, b) => (pinnedFirst ? Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) : 0) || desc(a.createdAt, b.createdAt) || desc(a._id, b._id),
  );

  return { posts: paginate(rows, pg, limit).map((p) => serializePost(p, me)), ...pageInfo(pg, limit, rows.length) };
}

function getPost({ me, params }) {
  return { post: serializePost(loadPost(params.id, me), me) };
}

function removePost({ me, params }) {
  const post = loadPost(params.id, me);
  const own = isOwn(post, me);
  if (!own && !moderates(me, post)) throw forbidden('You can only delete your own posts');
  update(post, { status: 'removed', ...(!own && { moderatedBy: me._id }) });
  return respond(204);
}

function setPinned({ me, params, body }) {
  const { pinned } = validate(pinSchema, body);
  const post = loadPost(params.id, me);
  if (!post.community || !moderates(me, post)) throw forbidden('Only community moderators can pin posts');
  update(post, { pinned });
  return { post: serializePost(post, me) };
}

function likePost({ me, params }) {
  const post = loadPost(params.id, me);
  assertNotArchived(post);
  const likes = post.likes ?? [];
  if (!likes.some((id) => sameId(id, me._id))) {
    update(post, { likes: [...likes, me._id], likeCount: (post.likeCount ?? 0) + 1 });
    if (byId('users', post.author)) notify({ recipient: post.author, actor: me._id, type: 'like', post: post._id });
  }
  return { likeCount: post.likeCount, likedByMe: true };
}

function unlikePost({ me, params }) {
  const post = loadPost(params.id, me);
  const likes = post.likes ?? [];
  if (likes.some((id) => sameId(id, me._id))) {
    update(post, { likes: likes.filter((id) => !sameId(id, me._id)), likeCount: (post.likeCount ?? 0) - 1 });
  }
  return { likeCount: post.likeCount ?? 0, likedByMe: false };
}

function serializeComment(comment, viewer, post) {
  return {
    id: comment._id,
    content: comment.content,
    author: authorJSON(byId('users', comment.author)),
    createdAt: comment.createdAt,
    canDelete: isOwn(comment, viewer) || moderates(viewer, post),
  };
}

function listComments({ me, params }) {
  const post = loadPost(params.id, me);
  const comments = findAll('comments', (c) => sameId(c.post, post._id) && c.status === 'visible')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .slice(0, 200);
  return { comments: comments.map((c) => serializeComment(c, me, post)) };
}

function addComment({ me, params, body }) {
  const { content } = validate(createCommentSchema, body);
  const post = loadPost(params.id, me);
  assertNotArchived(post);
  const comment = insert('comments', { post: post._id, author: me._id, content, status: 'visible' });
  update(post, { commentCount: (post.commentCount ?? 0) + 1 });
  if (byId('users', post.author)) {
    notify({ recipient: post.author, actor: me._id, type: 'comment', post: post._id, text: comment.content.slice(0, 140) });
  }
  return respond(201, { comment: serializeComment(comment, me, post) });
}

function removeComment({ me, params }) {
  const comment = byId('comments', params.commentId);
  if (!comment || comment.status !== 'visible' || !sameId(comment.post, params.id)) throw notFound('Comment not found');
  const post = loadPost(comment.post, me);
  const own = isOwn(comment, me);
  if (!own && !moderates(me, post)) throw forbidden('You can only delete your own comments');

  update(comment, { status: 'removed', ...(!own && { moderatedBy: me._id }) });
  update(post, { commentCount: (post.commentCount ?? 0) - 1 });
  return respond(204);
}

/* ------------------------------ Routes ------------------------------ */

register([
  ['GET', '/connections', listConnections],
  ['GET', '/connections/requests', listRequests],
  ['POST', '/connections', sendRequest],
  ['PATCH', '/connections/:id', respondToRequest],
  ['DELETE', '/connections/:id', removeConnection],

  ['GET', '/communities', listCommunities],
  ['POST', '/communities', createCommunity],
  ['GET', '/communities/:id', getCommunity],
  ['PATCH', '/communities/:id', updateCommunity],
  ['POST', '/communities/:id/join', joinCommunity],
  ['POST', '/communities/:id/leave', leaveCommunity],
  ['GET', '/communities/:id/members', communityMembers],
  ['POST', '/communities/:id/moderators', addModerator],
  ['DELETE', '/communities/:id/moderators/:userId', removeModerator],

  ['GET', '/posts', feed],
  ['POST', '/posts', createPost],
  ['GET', '/posts/:id', getPost],
  ['DELETE', '/posts/:id', removePost],
  ['PATCH', '/posts/:id/pin', setPinned],
  ['PUT', '/posts/:id/like', likePost],
  ['DELETE', '/posts/:id/like', unlikePost],
  ['GET', '/posts/:id/comments', listComments],
  ['POST', '/posts/:id/comments', addComment],
  ['DELETE', '/posts/:id/comments/:commentId', removeComment],
]);
