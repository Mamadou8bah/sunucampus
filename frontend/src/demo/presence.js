import { db } from './core.js';

/** About a third of demo students look "online", chosen per 10-minute window so it feels alive. */
export function onlineUserIds() {
  const slot = Math.floor(Date.now() / 600_000);
  const ids = new Set();
  for (const u of db.users) {
    if (u.role === 'admin') continue;
    const hash = [...(u._id + slot)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    if (hash % 3 === 0) ids.add(u._id);
  }
  return ids;
}
