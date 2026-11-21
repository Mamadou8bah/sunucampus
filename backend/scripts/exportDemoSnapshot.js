/**
 * Exports the demo database for the frontend-only demo (frontend built with VITE_STATIC_DEMO=true).
 *
 *   npm run demo:export
 *
 * Writes frontend/src/demo/snapshot.json (every collection, ids as strings, dates as ISO strings,
 * no password hashes or verification codes) and copies the photos it uses into frontend/public/uploads.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { BACKEND_ROOT, UPLOADS_DIR } from '../src/config/paths.js';

const FRONTEND = join(BACKEND_ROOT, '..', 'frontend');
const COLLECTIONS = ['users', 'communities', 'connections', 'posts', 'comments', 'conversations', 'messages', 'listings', 'notifications', 'reports', 'auditlogs'];
const SECRET_FIELDS = ['password', 'emailVerification', 'passwordChangedAt', '__v'];

/** ObjectId -> string, Date -> ISO string, recursively. */
function plain(value) {
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_FIELDS.includes(k)).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
await connectDB(env.mongoUri);

const snapshot = { exportedAt: new Date().toISOString(), version: Date.now() };
for (const name of COLLECTIONS) {
  snapshot[name] = (await mongoose.connection.db.collection(name).find().toArray()).map(plain);
}
await disconnectDB();

mkdirSync(join(FRONTEND, 'src', 'demo'), { recursive: true });
writeFileSync(join(FRONTEND, 'src', 'demo', 'snapshot.json'), JSON.stringify(snapshot));

for (const folder of ['avatars', 'listings']) {
  const from = join(UPLOADS_DIR, folder);
  if (existsSync(from)) cpSync(from, join(FRONTEND, 'public', 'uploads', folder), { recursive: true });
}
console.log(`Exported ${COLLECTIONS.map((c) => `${snapshot[c].length} ${c}`).join(', ')}`);
