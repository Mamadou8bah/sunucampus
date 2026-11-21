import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, tokenStore } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

const SocketContext = createContext({
  socket: null,
  unread: 0,
  refreshUnread: () => {},
  notifUnread: 0,
  setNotifUnread: () => {},
  latestNotification: null,
  online: new Set(),
  trackPresence: () => {},
});

/** One Socket.IO connection per signed-in session, plus the unread badge and who is online. */
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(() => new Set());
  const [notifUnread, setNotifUnread] = useState(0);
  // The most recent live notification, so screens (and the warning notice) can react to it.
  const [latestNotification, setLatestNotification] = useState(null);

  const refreshNotifications = useCallback(() => {
    api('/notifications/unread')
      .then((d) => setNotifUnread(d.unread))
      .catch(() => {});
  }, []);

  const refreshUnread = useCallback(() => {
    api('/conversations/unread')
      .then((d) => setUnread(d.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    // Same origin: Vite proxies /socket.io to the backend in development.
    let s;
    let cancelled = false;
    const setup = (sock) => {
      if (cancelled) return sock.close();
      s = sock;
      setSocket(s);
      attach(s);
    };
    if (import.meta.env.VITE_STATIC_DEMO === 'true') import('../demo/index.js').then(({ createDemoSocket }) => setup(createDemoSocket()));
    else setup(io({ auth: { token: tokenStore.get() }, transports: ['websocket'] }));

    function attach(s) {
    refreshUnread();
    refreshNotifications();

    s.on('notification', ({ notification, unread: count }) => {
      setNotifUnread(count);
      setLatestNotification(notification);
    });
    s.on('message:new', (m) => {
      if (m.sender !== user.id) setUnread((n) => n + 1);
    });
    s.on('conversation:read', (e) => e.byMe && refreshUnread());
    s.on('connect', () => {
      refreshUnread();
      refreshNotifications();
    });
    s.on('presence', ({ userId, online: isOnline }) =>
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      }),
    );

    }

    return () => {
      cancelled = true;
      s?.close();
      setSocket(null);
      setOnline(new Set());
    };
  }, [user?.id, refreshUnread, refreshNotifications]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Asks which of these students (connections only) are online right now. */
  const trackPresence = useCallback(
    (ids) => {
      if (!socket || !ids.length) return;
      const ask = () =>
        socket.emit('presence:query', ids, (onlineIds) =>
          setOnline((prev) => {
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            for (const id of onlineIds) next.add(id);
            return next;
          }),
        );
      if (socket.connected) ask();
      else socket.once('connect', ask);
    },
    [socket],
  );

  return <SocketContext.Provider value={{ socket, unread, refreshUnread, online, trackPresence, notifUnread, setNotifUnread, latestNotification }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
