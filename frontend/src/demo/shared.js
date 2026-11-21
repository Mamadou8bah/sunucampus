// Logic several demo route modules need: connections, permissions, notifications, audit log.
// Ports of backend/src/services/{connections,permissions,notifications}.js and utils/audit.js.
import { byId, db, emitToUser, findOne, insert, nowISO, sameId, update } from './core.js';

/* ------------------------------ Connections ------------------------------ */

export const RESEND_AFTER_DAYS = 30;
export const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');
export const otherUserOf = (connection, userId) => (sameId(connection.requester, userId) ? connection.recipient : connection.requester);

/** none | connected | pending_outgoing | pending_incoming | declined, from the viewer's side. */
export function relationFor(connection, viewerId) {
  if (!connection) return { status: 'none' };
  const iAmRequester = sameId(connection.requester, viewerId);
  const base = { connectionId: connection._id };
  switch (connection.status) {
    case 'accepted':
      return { ...base, status: 'connected', since: connection.respondedAt ?? connection.updatedAt };
    case 'pending':
      return { ...base, status: iAmRequester ? 'pending_outgoing' : 'pending_incoming' };
    case 'rejected': {
      if (!iAmRequester) return { status: 'none' };
      const retryAt = new Date(new Date(connection.respondedAt).getTime() + RESEND_AFTER_DAYS * 86_400_000);
      return retryAt > new Date() ? { ...base, status: 'declined', retryAt: retryAt.toISOString() } : { status: 'none' };
    }
    default:
      return { status: 'none' };
  }
}

export const findConnection = (a, b) => findOne('connections', (c) => c.pairKey === pairKeyOf(a, b));
export const areConnected = (a, b) => findConnection(a, b)?.status === 'accepted';
/** Ids of everyone the user has any connection record with. */
export const relatedUserIds = (userId) =>
  db.connections.filter((c) => sameId(c.requester, userId) || sameId(c.recipient, userId)).map((c) => otherUserOf(c, userId));
/** Ids of accepted connections. */
export const connectedUserIds = (userId) =>
  db.connections
    .filter((c) => c.status === 'accepted' && (sameId(c.requester, userId) || sameId(c.recipient, userId)))
    .map((c) => otherUserOf(c, userId));

/* ------------------------------ Permissions ------------------------------ */

export const isAdmin = (user) => user?.role === 'admin';
export const isCommunityMember = (community, userId) => (community.members ?? []).some((m) => sameId(m, userId));
export const isCommunityModerator = (community, userId) => (community.moderators ?? []).some((m) => sameId(m, userId));
export const canModerateCommunity = (user, community) => Boolean(user && (isAdmin(user) || (community && isCommunityModerator(community, user._id))));
export const canViewCommunity = (user, community) =>
  ['active', 'archived'].includes(community.status) || sameId(community.creator, user._id) || canModerateCommunity(user, community);
export const canPostInCommunity = (user, community) => community.status === 'active' && isCommunityMember(community, user._id);

/* ------------------------------ Audit log ------------------------------ */

export const recordAudit = (actor, action, targetType, targetId, details) =>
  insert('auditlogs', { actor: actor._id, action, targetType, targetId: String(targetId), details });

/* ------------------------------ Notifications ------------------------------ */

const MAX_ACTORS = 20;
export const unreadCount = (userId) => db.notifications.filter((n) => sameId(n.recipient, userId) && !n.readAt).length;

/** Same JSON as backend serializeNotification (with actors/post/community populated). */
export function serializeNotification(n) {
  const post = n.post ? byId('posts', n.post) : null;
  const community = n.community ? byId('communities', n.community) : null;
  return {
    id: n._id,
    type: n.type,
    actors: (n.actors ?? [])
      .map((id) => byId('users', id))
      .filter((a) => a && a.name)
      .slice(0, 3)
      .map((a) => ({ id: a._id, name: a.name, avatarUrl: a.avatarUrl, isVerified: Boolean(a.emailVerifiedAt) })),
    actorCount: n.actorCount ?? 0,
    post: n.post ? (post ? { id: post._id, excerpt: post.content.slice(0, 90) } : { id: n.post }) : undefined,
    community: community ? { id: community._id, name: community.name, slug: community.slug } : undefined,
    text: n.text,
    subject: n.subject,
    read: Boolean(n.readAt),
    createdAt: n.updatedAt,
  };
}

/**
 * Creates (or groups, for likes) a notification and pushes it to the recipient if they are the
 * signed-in visitor. Never throws. Same rules as the backend: never about your own actions.
 */
export function notify({ recipient, actor, type, post, community, text, subject }) {
  try {
    if (!recipient) return null;
    const actorId = actor?._id ?? actor;
    if (actorId && sameId(recipient, actorId)) return null;
    let doc = null;
    if (type === 'like') {
      doc = db.notifications.find((n) => sameId(n.recipient, recipient) && n.type === 'like' && sameId(n.post, post) && !n.readAt) ?? null;
      if (doc) {
        if (doc.actors.some((a) => sameId(a, actorId))) return null;
        update(doc, { actors: [String(actorId), ...doc.actors].slice(0, MAX_ACTORS), actorCount: doc.actorCount + 1 });
      }
    }
    if (!doc) {
      doc = insert('notifications', {
        recipient: String(recipient),
        type,
        actors: actorId ? [String(actorId)] : [],
        actorCount: actorId ? 1 : 0,
        ...(post && { post: String(post) }),
        ...(community && { community: String(community) }),
        ...(text && { text }),
        ...(subject && { subject }),
        readAt: null,
      });
    }
    emitToUser(recipient, 'notification', { notification: serializeNotification(doc), unread: unreadCount(recipient) });
    return doc;
  } catch (err) {
    console.error('[demo] notification failed', err);
    return null;
  }
}

export { nowISO };
