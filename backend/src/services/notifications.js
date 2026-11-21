import { Notification } from '../models/Notification.js';
import { emitToUser } from '../realtime/socket.js';

const ACTOR_FIELDS = 'name avatarUrl programme emailVerifiedAt';
const MAX_ACTORS = 20;

export const unreadCount = (userId) => Notification.countDocuments({ recipient: userId, readAt: null });

export function serializeNotification(n) {
  return {
    id: n.id,
    type: n.type,
    actors: (n.actors ?? [])
      .filter((a) => a && a.name)
      .slice(0, 3)
      .map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl, isVerified: Boolean(a.emailVerifiedAt) })),
    actorCount: n.actorCount,
    post: n.post && (n.post.content !== undefined ? { id: n.post.id, excerpt: n.post.content.slice(0, 90) } : { id: n.post.toString() }),
    community: n.community && n.community.name ? { id: n.community.id, name: n.community.name, slug: n.community.slug } : undefined,
    text: n.text,
    subject: n.subject,
    read: Boolean(n.readAt),
    createdAt: n.updatedAt,
  };
}

export const populateNotification = (query) =>
  query.populate('actors', ACTOR_FIELDS).populate('post', 'content').populate('community', 'name slug');

/**
 * Creates (or groups) a notification and pushes it to the recipient's open tabs.
 * Never throws: a failed notification must not fail the action that caused it.
 */
export async function notify({ recipient, actor, type, post, community, text, subject }) {
  try {
    if (!recipient) return null;
    const actorId = actor?._id ?? actor;
    if (actorId && recipient.toString() === actorId.toString()) return null; // no notifications about yourself

    let doc;
    if (type === 'like') {
      // One unread "liked your post" per post, collecting everyone who liked it.
      doc = await Notification.findOne({ recipient, type, post, readAt: null });
      if (doc) {
        if (doc.actors.some((a) => a.equals(actorId))) return null;
        doc.actors = [actorId, ...doc.actors].slice(0, MAX_ACTORS);
        doc.actorCount += 1;
        await doc.save();
      }
    }
    if (!doc) {
      doc = await Notification.create({
        recipient,
        type,
        actors: actorId ? [actorId] : [],
        actorCount: actorId ? 1 : 0,
        post,
        community,
        text,
        subject,
      });
    }

    const full = await populateNotification(Notification.findById(doc._id));
    emitToUser(recipient, 'notification', { notification: serializeNotification(full), unread: await unreadCount(recipient) });
    return doc;
  } catch (err) {
    console.error('Notification failed', err);
    return null;
  }
}
