/**
 * The in-browser backend used by the frontend-only demo (VITE_STATIC_DEMO=true).
 *
 * It mirrors the real Express API closely: same paths, same JSON shapes, same error format
 * ({ status, message, details }). Data starts from snapshot.json (exported from the demo
 * database) and every change is saved in this browser's localStorage, so each visitor has
 * their own copy. "Reset demo" (resetDemo) brings it back to the snapshot.
 */
import snapshot from './snapshot.json';

const STORE_KEY = `sunucampus.demo.${snapshot.version}`;
export const COLLECTIONS = ['users', 'communities', 'connections', 'posts', 'comments', 'conversations', 'messages', 'listings', 'notifications', 'reports', 'auditlogs'];

/* ------------------------------ Errors ------------------------------ */

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (message = 'Bad request', details) => new HttpError(400, message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to do this') => new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const conflict = (message = 'Conflict') => new HttpError(409, message);

/** Validates data with a zod schema like the backend's validate middleware; returns the parsed value. */
export function validate(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw badRequest('Validation failed', details);
  }
  return result.data;
}

/* ------------------------------ Data ------------------------------ */

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Moves every date forward so the demo always looks recent, whenever it is opened. */
function shiftDates(value, offset) {
  if (typeof value === 'string' && ISO.test(value)) return new Date(new Date(value).getTime() + offset).toISOString();
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, offset));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, offset)]));
  return value;
}

function freshData() {
  const offset = Math.max(0, Date.now() - new Date(snapshot.exportedAt).getTime());
  const data = {};
  for (const name of COLLECTIONS) data[name] = shiftDates(snapshot[name] ?? [], offset);
  // Demo-only: plain-text passwords for accounts made in this browser (seeded accounts use the defaults).
  data.passwords = {};
  return data;
}

function load() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // Corrupt or blocked storage: start fresh.
  }
  // Drop data saved for older snapshots.
  for (const key of Object.keys(localStorage)) if (key.startsWith('sunucampus.demo.') && key !== STORE_KEY) localStorage.removeItem(key);
  return freshData();
}

/** The live data: db.users, db.posts, … arrays of plain objects with string `_id`s and ISO dates. */
export const db = load();

let saveTimer = null;
/** Saves to localStorage shortly after the last change. */
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch {
      // Storage full: the demo keeps working for this visit.
    }
  }, 150);
}

export function resetDemo() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem('sunucampus.token');
  window.location.assign('/');
}

/** A 24-hex id like a MongoDB ObjectId (time-ordered), so id validation behaves the same. */
export function newId() {
  const time = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  let rest = '';
  for (let i = 0; i < 16; i += 1) rest += Math.floor(Math.random() * 16).toString(16);
  return time + rest;
}

export const nowISO = () => new Date().toISOString();
export const sameId = (a, b) => a != null && b != null && String(a) === String(b);

export const byId = (collection, id) => (id == null ? null : db[collection].find((d) => d._id === String(id)) ?? null);
export const findAll = (collection, predicate = () => true) => db[collection].filter(predicate);
export const findOne = (collection, predicate) => db[collection].find(predicate) ?? null;

/** Adds a document with _id, createdAt and updatedAt (unless given) and saves. */
export function insert(collection, doc) {
  const at = nowISO();
  const full = { _id: newId(), createdAt: at, updatedAt: at, ...doc };
  db[collection].push(full);
  save();
  return full;
}

/** Applies changes to a document, bumps updatedAt (unless touch is false) and saves. */
export function update(doc, changes = {}, { touch = true } = {}) {
  Object.assign(doc, changes);
  if (touch) doc.updatedAt = nowISO();
  save();
  return doc;
}

export function remove(collection, id) {
  const i = db[collection].findIndex((d) => d._id === String(id));
  if (i >= 0) db[collection].splice(i, 1);
  save();
}

/* ------------------------------ Shared serializers ------------------------------ */

/** Mongoose-style toJSON: `id` instead of `_id`. Use for models with the cleanJSON plugin. */
export function cleanJSON(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

// Same as backend User.toJSON: everything except secrets, plus id and isVerified.
export function userJSON(u) {
  if (!u) return null;
  // eslint-disable-next-line no-unused-vars
  const { _id, emailVerification, password, ...rest } = u;
  return { id: _id, ...rest, isVerified: Boolean(u.emailVerifiedAt) };
}

const PUBLIC_FIELDS = ['name', 'role', 'programme', 'yearOfStudy', 'bio', 'interests', 'skills', 'goals', 'prompts', 'avatarUrl', 'createdAt'];
// Same as backend User.toPublicJSON (fields other students may see).
export function publicUserJSON(u) {
  if (!u) return null;
  const out = { id: u._id, isVerified: Boolean(u.emailVerifiedAt) };
  for (const f of PUBLIC_FIELDS) out[f] = u[f];
  return out;
}

/** Builds the JSON of a populated subset of user fields (like populate('author', 'name avatarUrl …')). */
export function pickUser(u, fields) {
  if (!u) return null;
  const out = { id: u._id };
  for (const f of fields.split(' ')) out[f] = u[f];
  return out;
}

/* ------------------------------ Realtime ------------------------------ */

const listeners = new Map(); // event -> Set(fn) for the signed-in user's fake socket
let currentUserId = null;
export const setCurrentUser = (id) => {
  currentUserId = id;
};
export const getCurrentUserId = () => currentUserId;

/** Like the backend's emitToUser: only the signed-in visitor has a "socket" in the demo. */
export function emitToUser(userId, event, payload) {
  if (!sameId(userId, currentUserId)) return;
  setTimeout(() => listeners.get(event)?.forEach((fn) => fn(payload)), 0);
}

export const socketListeners = listeners;

/* ------------------------------ Router ------------------------------ */

const routes = [];

/**
 * Registers routes. Each route: [method, '/posts/:id/like', handler, { public?: true, roles?: ['admin'] }].
 * handler(ctx) returns the JSON body (or { status, body } via respond()); throw HttpError for errors.
 * ctx = { me, params, query, body, formData, method, path }
 */
export function register(list) {
  for (const [method, pattern, handler, options = {}] of list) {
    const keys = [];
    const regex = new RegExp(
      `^${pattern.replace(/\/:([A-Za-z]+)/g, (_m, k) => {
        keys.push(k);
        return '/([^/]+)';
      })}/?$`,
    );
    routes.push({ method, regex, keys, handler, options, pattern });
  }
}

/** Return respond(201, data) from a handler to set a status other than 200; respond(204) for no body. */
export const respond = (status, body = null) => ({ __respond: true, status, body });

export function userFromToken(token) {
  if (!token?.startsWith('demo-')) return null;
  return byId('users', token.slice(5));
}

/** Handles one request. Returns { status, data } exactly like fetch + res.json() would. */
export async function handle({ method, path, query = {}, body, formData, token }) {
  const route = routes.find((r) => r.method === method && r.regex.test(path));
  if (!route) {
    console.warn(`[demo api] no route for ${method} /api${path}`);
    return { status: 404, data: { error: { message: `Route not found: ${method} /api${path}` } } };
  }
  const match = route.regex.exec(path);
  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));

  try {
    let me = null;
    if (!route.options.public) {
      if (!token) throw unauthorized();
      me = userFromToken(token);
      if (!me) throw unauthorized('Account no longer exists');
      if (me.status !== 'active') throw forbidden(`Your account is ${me.status}`);
      if (route.options.roles && !route.options.roles.includes(me.role)) throw forbidden();
      setCurrentUser(me._id);
      // Throttled like the backend, so "active users" statistics move.
      if (!me.lastActiveAt || Date.now() - new Date(me.lastActiveAt).getTime() > 5 * 60_000) update(me, { lastActiveAt: nowISO() }, { touch: false });
    }
    // Small delay so loading states look natural.
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 120));
    const result = await route.handler({ me, params, query, body, formData, method, path });
    if (result?.__respond) return { status: result.status, data: result.body };
    return { status: 200, data: result ?? null };
  } catch (err) {
    if (err instanceof HttpError) {
      return { status: err.status, data: { error: { message: err.message, ...(err.details && { details: err.details }) } } };
    }
    console.error('[demo api]', method, path, err);
    return { status: 500, data: { error: { message: 'Internal server error' } } };
  }
}

/* ------------------------------ Files ------------------------------ */

/** Turns an uploaded image File into a small JPEG data URL (stored in localStorage instead of a server). */
export async function fileToDataUrl(file, maxSize = 640) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw badRequest('Upload a JPG, PNG or WebP image');
  if (file.size > 3 * 1024 * 1024) throw badRequest('Images must be 3 MB or smaller');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** Triggers a browser download of text content (used for CSV export). */
export function downloadText(filename, text, type = 'text/csv') {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
