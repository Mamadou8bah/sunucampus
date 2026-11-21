import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useSocket } from '../realtime/SocketContext.jsx';
import { NoticeSheet } from '../pages/Notifications.jsx';

/**
 * Shows an admin's warning as soon as the student is in the app, whether it arrived
 * while they were away or live. It stays until they tap "I understand".
 */
export default function WarningNotice() {
  const { latestNotification, setNotifUnread } = useSocket();
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    api('/notifications', { query: { limit: 30 } })
      .then((d) => {
        const unreadWarning = d.notifications.find((n) => n.type === 'warning' && !n.read);
        if (unreadWarning) setWarning(unreadWarning);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (latestNotification?.type === 'warning') setWarning(latestNotification);
  }, [latestNotification]);

  async function acknowledge() {
    const n = warning;
    setWarning(null);
    try {
      const d = await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } });
      setNotifUnread(d.unread);
    } catch {
      // It will show again next time.
    }
  }

  return <NoticeSheet notification={warning} onClose={acknowledge} />;
}
