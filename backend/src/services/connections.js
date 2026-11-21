import { Connection, CONNECTION_STATUS, pairKeyOf } from '../models/Connection.js';

export const RESEND_AFTER_DAYS = 30;

/**
 * The relationship between the viewer and another student, from the viewer's side:
 * none | connected | pending_outgoing | pending_incoming | declined
 * ("declined" is only shown to the person whose request was declined).
 */
export function relationFor(connection, viewerId) {
  if (!connection) return { status: 'none' };
  const iAmRequester = connection.requester.toString() === viewerId.toString();
  const base = { connectionId: connection.id };

  switch (connection.status) {
    case CONNECTION_STATUS.ACCEPTED:
      return { ...base, status: 'connected', since: connection.respondedAt ?? connection.updatedAt };
    case CONNECTION_STATUS.PENDING:
      return { ...base, status: iAmRequester ? 'pending_outgoing' : 'pending_incoming' };
    case CONNECTION_STATUS.REJECTED: {
      if (!iAmRequester) return { status: 'none' };
      const retryAt = new Date(connection.respondedAt.getTime() + RESEND_AFTER_DAYS * 86_400_000);
      return retryAt > new Date() ? { ...base, status: 'declined', retryAt } : { status: 'none' };
    }
    default:
      return { status: 'none' };
  }
}

export const findConnection = (a, b) => Connection.findOne({ pairKey: pairKeyOf(a, b) });

export const areConnected = async (a, b) =>
  Boolean(await Connection.exists({ pairKey: pairKeyOf(a, b), status: CONNECTION_STATUS.ACCEPTED }));

/** Ids of everyone the user has any connection record with (to hide them from matches). */
export async function relatedUserIds(userId) {
  const rows = await Connection.find({ $or: [{ requester: userId }, { recipient: userId }] }, 'requester recipient');
  return rows.map((c) => c.otherUser(userId));
}

/** Ids of accepted connections. */
export async function connectedUserIds(userId) {
  const rows = await Connection.find(
    { status: CONNECTION_STATUS.ACCEPTED, $or: [{ requester: userId }, { recipient: userId }] },
    'requester recipient',
  );
  return rows.map((c) => c.otherUser(userId));
}
