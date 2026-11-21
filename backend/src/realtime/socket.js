import { Server } from 'socket.io';
import { User } from '../models/User.js';
import { Conversation } from '../models/Message.js';
import { ACCOUNT_STATUS } from '../config/roles.js';
import { verifyToken } from '../utils/token.js';
import { env } from '../config/env.js';
import { connectedUserIds } from '../services/connections.js';

let io = null;

const userRoom = (userId) => `user:${userId}`;

/** Sends an event to every open tab of a user. Safe to call when sockets are not running (tests). */
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(userId.toString())).emit(event, payload);
}

/** Disconnects a user's sockets, e.g. after a suspension. */
export function disconnectUser(userId) {
  io?.in(userRoom(userId.toString())).disconnectSockets(true);
}

// userId -> number of open sockets (a student may have several tabs or devices).
const online = new Map();

export const isOnline = (userId) => online.has(userId.toString());

async function announcePresence(userId, isUserOnline) {
  try {
    const ids = await connectedUserIds(userId);
    for (const id of ids) emitToUser(id, 'presence', { userId, online: isUserOnline });
  } catch {
    // Presence is best-effort.
  }
}

export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.clientOrigin } });

  // Same rules as the REST API: valid token, existing and active account.
  io.use(async (socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token ?? '');
      const user = await User.findById(payload.sub);
      if (!user || user.status !== ACCOUNT_STATUS.ACTIVE || user.changedPasswordAfter(payload.iat)) {
        return next(new Error('unauthorized'));
      }
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    socket.join(userRoom(userId));

    // Presence: count open tabs; tell connections when someone comes online or leaves.
    const count = (online.get(userId) ?? 0) + 1;
    online.set(userId, count);
    // Not awaited, so the handlers below are attached before any client event can arrive.
    if (count === 1) announcePresence(userId, true);

    socket.on('disconnect', () => {
      const left = (online.get(userId) ?? 1) - 1;
      if (left > 0) return online.set(userId, left);
      online.delete(userId);
      announcePresence(userId, false);
    });

    // Which of these students are online? Only answered for the asker's connections.
    socket.on('presence:query', async (ids, ack) => {
      if (typeof ack !== 'function' || !Array.isArray(ids)) return;
      try {
        const allowed = new Set((await connectedUserIds(userId)).map(String));
        ack(ids.slice(0, 200).map(String).filter((id) => allowed.has(id) && online.has(id)));
      } catch {
        ack([]);
      }
    });

    // Typing indicators are relayed only between the two participants.
    socket.on('typing', async ({ conversationId, isTyping } = {}) => {
      try {
        const conversation = await Conversation.findById(conversationId, 'participants');
        if (!conversation?.hasParticipant(userId)) return;
        const other = conversation.otherParticipant(userId);
        emitToUser(other, 'typing', { conversationId, userId, isTyping: Boolean(isTyping) });
      } catch {
        // Ignore malformed ids.
      }
    });
  });

  return io;
}

export async function closeSocket() {
  await io?.close();
  io = null;
  online.clear();
}
