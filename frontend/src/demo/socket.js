import { db, emitToUser, getCurrentUserId, sameId, socketListeners } from './core.js';
import { onlineUserIds } from './presence.js';

/**
 * Stands in for the Socket.IO client in the frontend-only demo. Server events come from
 * core.emitToUser; presence and typing are answered locally.
 */
export function createDemoSocket() {
  const own = []; // [event, fn] registered by this socket, removed on close()
  const socket = {
    connected: true,
    id: 'demo-socket',
    on(event, fn) {
      if (!socketListeners.has(event)) socketListeners.set(event, new Set());
      socketListeners.get(event).add(fn);
      own.push([event, fn]);
      if (event === 'connect') setTimeout(fn, 0);
      return socket;
    },
    once(event, fn) {
      const wrapped = (...args) => {
        socket.off(event, wrapped);
        fn(...args);
      };
      return socket.on(event, wrapped);
    },
    off(event, fn) {
      socketListeners.get(event)?.delete(fn);
      return socket;
    },
    emit(event, payload, ack) {
      const me = getCurrentUserId();
      if (event === 'presence:query' && typeof ack === 'function') {
        // Like the backend: only answered for the asker's connections.
        const online = onlineUserIds();
        const connected = new Set(
          db.connections
            .filter((c) => c.status === 'accepted' && (sameId(c.requester, me) || sameId(c.recipient, me)))
            .map((c) => (sameId(c.requester, me) ? c.recipient : c.requester)),
        );
        setTimeout(() => ack((payload ?? []).map(String).filter((id) => connected.has(id) && online.has(id))), 30);
      }
      if (event === 'typing' && payload?.conversationId) {
        // Nobody else is really here, so a typing indicator goes nowhere; kept for parity.
        const conversation = db.conversations.find((c) => c._id === payload.conversationId);
        if (conversation?.participants.some((p) => sameId(p, me))) {
          const other = conversation.participants.find((p) => !sameId(p, me));
          emitToUser(other, 'typing', { conversationId: conversation._id, userId: me, isTyping: Boolean(payload.isTyping) });
        }
      }
      return socket;
    },
    close() {
      for (const [event, fn] of own) socketListeners.get(event)?.delete(fn);
      own.length = 0;
      socket.connected = false;
    },
  };
  return socket;
}
