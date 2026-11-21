// Demo ports of the auth, users/profile, matching, meta and search endpoints.
// Backend sources: routes/{auth,users,search}.js, controllers/{auth,verification,user,avatar,meta,search}Controller.js,
// utils/matching.js, validators/{auth,profile}.js.
import { z } from 'zod';
import {
  badRequest,
  byId,
  cleanJSON,
  conflict,
  db,
  fileToDataUrl,
  findAll,
  findOne,
  forbidden,
  insert,
  notFound,
  nowISO,
  publicUserJSON,
  register,
  respond,
  sameId,
  save,
  unauthorized,
  update,
  userJSON,
  validate,
} from '../core.js';
import { canModerateCommunity, connectedUserIds, findConnection, isAdmin, relatedUserIds, relationFor } from '../shared.js';

/* ------------------------------ Constants (config/roles.js, config/env.js) ------------------------------ */

const PROFILE_PROMPTS = [
  'We’ll get along if…',
  'I’m on SunuCampus to…',
  'Ask me about…',
  'My ideal study session…',
  'A project I’d love to build…',
  'After class you’ll find me…',
  'I can help you with…',
];
const CONNECTION_GOALS = ['friendship', 'study_partner', 'networking', 'project_collaboration', 'mentorship'];
const VERIFIED_EMAIL_DOMAINS = ['utg.edu.gm'];
const ALLOWED_EMAIL_DOMAINS = []; // empty: any domain may register
const READABLE_COMMUNITY = ['active', 'archived'];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Mongo-like descending sort on optional ISO/number fields: missing values go last. */
const desc = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? 1 : a > b ? -1 : 0;
};
const matchesPattern = (value, pattern) =>
  Array.isArray(value) ? value.some((v) => typeof v === 'string' && pattern.test(v)) : typeof value === 'string' && pattern.test(value);

/* ------------------------------ Validators ------------------------------ */

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .refine((value) => ALLOWED_EMAIL_DOMAINS.length === 0 || ALLOWED_EMAIL_DOMAINS.includes(value.split('@')[1]), {
    message: 'Use your university email address',
  });

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: emailField,
  password: passwordField,
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
const requestCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
});
const confirmCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordField,
});

const MAX_TAGS = 15;
const tagList = (label) =>
  z
    .array(z.string().max(30, `Each ${label} must be at most 30 characters`))
    .max(MAX_TAGS, `Add at most ${MAX_TAGS} ${label}s`)
    .transform((tags) => [...new Set(tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))]);
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
    programme: optionalText(120),
    yearOfStudy: z.coerce.number().int().min(1).max(7).nullable().optional(),
    bio: optionalText(500),
    interests: tagList('interest').optional(),
    skills: tagList('skill').optional(),
    prompts: z
      .array(
        z.object({
          question: z.enum(PROFILE_PROMPTS),
          answer: z.string().trim().min(1, 'Write an answer').max(150, 'Answers can be at most 150 characters'),
        }),
      )
      .max(3, 'Choose up to three prompts')
      .refine((list) => new Set(list.map((p) => p.question)).size === list.length, 'Each prompt can only be used once')
      .optional(),
    goals: z
      .array(z.enum(CONNECTION_GOALS))
      .max(CONNECTION_GOALS.length)
      .transform((g) => [...new Set(g)])
      .optional(),
    avatarUrl: z
      .string()
      .trim()
      .url('Enter a valid image URL')
      .refine((v) => /^https?:\/\//.test(v), 'Image URL must start with http or https')
      .or(z.literal('').transform(() => undefined))
      .optional(),
  })
  .strict();

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []));

const discoverQuery = z.object({
  q: z.string().trim().max(100).optional(),
  programme: z.string().trim().max(120).optional(),
  year: z.coerce.number().int().min(1).max(7).optional(),
  interests: csv,
  skills: csv,
  goal: z.enum(CONNECTION_GOALS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
const matchesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const searchQuery = z.object({
  q: z.string().trim().min(1, 'Type something to search').max(100),
  type: z.enum(['all', 'people', 'communities', 'posts']).default('all'),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

/* ------------------------------ Matching (utils/matching.js) ------------------------------ */

const GOAL_LABELS = {
  friendship: 'friendship',
  study_partner: 'a study partner',
  networking: 'networking',
  project_collaboration: 'project collaboration',
  mentorship: 'mentorship',
};
const WEIGHTS = { goals: 0.3, interests: 0.3, skills: 0.15, programme: 0.15, year: 0.1 };

const intersect = (a = [], b = []) => {
  const set = new Set(b);
  return [...new Set(a)].filter((x) => set.has(x));
};
const overlap = (a = [], b = []) => {
  const smaller = Math.min(new Set(a).size, new Set(b).size);
  return smaller === 0 ? 0 : intersect(a, b).length / smaller;
};
const jaccard = (a = [], b = []) => {
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect(a, b).length / union;
};
const sameText = (a, b) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
const listText = (items, max = 3) => {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
};

function yearFactor(me, other, sharedGoals) {
  if (!me.yearOfStudy || !other.yearOfStudy) return 0;
  const gap = Math.abs(me.yearOfStudy - other.yearOfStudy);
  if (sharedGoals.includes('mentorship') && gap >= 1) return gap <= 3 ? 1 : 0.5;
  return Math.max(0, 1 - gap / 3);
}

function skillsFactor(me, other, sharedGoals) {
  const shared = overlap(me.skills, other.skills);
  if (!sharedGoals.includes('project_collaboration')) return shared;
  const mine = new Set(me.skills ?? []);
  const theirs = new Set(other.skills ?? []);
  if (theirs.size === 0) return shared;
  const complementary = [...theirs].filter((s) => !mine.has(s)).length / theirs.size;
  return Math.max(shared, complementary * 0.8);
}

export function scoreMatch(me, other) {
  const sharedGoals = intersect(me.goals, other.goals);
  const sharedInterests = intersect(me.interests, other.interests);
  const sharedSkills = intersect(me.skills, other.skills);
  const sameProgramme = sameText(me.programme, other.programme);

  const factors = {
    goals: overlap(me.goals, other.goals),
    interests: jaccard(me.interests, other.interests),
    skills: skillsFactor(me, other, sharedGoals),
    programme: sameProgramme ? 1 : 0,
    year: yearFactor(me, other, sharedGoals),
  };
  const total = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * factors[key], 0);

  const reasons = [];
  if (sharedGoals.length) reasons.push(`Both looking for ${listText(sharedGoals.map((g) => GOAL_LABELS[g] ?? g))}`);
  if (sharedInterests.length) reasons.push(`Shared interests: ${listText(sharedInterests)}`);
  if (sharedSkills.length) reasons.push(`Shared skills: ${listText(sharedSkills)}`);
  else if (sharedGoals.includes('project_collaboration') && other.skills?.length) {
    reasons.push(`Brings skills you don't list: ${listText(other.skills)}`);
  }
  if (sameProgramme) reasons.push(`Also studies ${other.programme}`);
  if (me.yearOfStudy && other.yearOfStudy) {
    if (me.yearOfStudy === other.yearOfStudy) reasons.push(`Also in year ${other.yearOfStudy}`);
    else if (sharedGoals.includes('mentorship')) reasons.push(`Year ${other.yearOfStudy}, a good mentorship fit`);
  }

  return {
    score: Math.round(total * 100),
    factors,
    reasons,
    shared: { goals: sharedGoals, interests: sharedInterests, skills: sharedSkills },
  };
}

export const isMatchable = (user) => Boolean(user.goals?.length && (user.interests?.length || user.skills?.length));

export function rankMatches(me, candidates, { minScore = 15, limit = 20 } = {}) {
  return candidates
    .map((user) => ({ user, ...scoreMatch(me, user) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score || a.user.name.localeCompare(b.user.name))
    .slice(0, limit);
}

/* ------------------------------ Auth ------------------------------ */

const authResponse = (user) => ({ token: `demo-${user._id}`, user: userJSON(user) });

/** Demo passwords: accounts made in this browser keep theirs in db.passwords; seeded ones use the defaults. */
function passwordOf(user) {
  db.passwords ??= {};
  if (db.passwords[user._id] != null) return db.passwords[user._id];
  return user.role === 'admin' ? 'ChangeMe123' : 'Password123';
}

function registerUser({ body }) {
  const { name, email, password } = validate(registerSchema, body);
  if (findOne('users', (u) => u.email === email)) throw conflict('An account with that email already exists');

  const user = insert('users', {
    name,
    email,
    role: 'student',
    status: 'active',
    warningCount: 0,
    interests: [],
    skills: [],
    goals: [],
    prompts: [],
    lastActiveAt: nowISO(),
  });
  db.passwords ??= {};
  db.passwords[user._id] = password;
  save();
  return respond(201, authResponse(user));
}

function login({ body }) {
  const { email, password } = validate(loginSchema, body);
  const user = findOne('users', (u) => u.email === email);
  if (!user || passwordOf(user) !== password) throw unauthorized('Incorrect email or password');
  if (user.status !== 'active') {
    const reason = user.statusReason ? `: ${user.statusReason}` : '';
    throw forbidden(`Your account is ${user.status}${reason}`);
  }
  update(user, { lastActiveAt: nowISO() });
  return authResponse(user);
}

function changePassword({ me, body }) {
  const { currentPassword, newPassword } = validate(changePasswordSchema, body);
  if (passwordOf(me) !== currentPassword) throw badRequest('Current password is incorrect');
  db.passwords[me._id] = newPassword;
  update(me, { passwordChangedAt: nowISO() });
  return authResponse(me);
}

/* ------------------------------ Email verification ------------------------------ */

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const domainOf = (email) => email.split('@')[1];
const maskEmail = (email) => email.replace(/^(.{2})[^@]*(@.*)$/, (_m, a, b) => `${a}•••${b}`);

// Pending codes are kept outside the user doc (db.emailVerifications[userId]) so userJSON never exposes them.
const pendingStore = () => {
  db.emailVerifications ??= {};
  return db.emailVerifications;
};

function requestCode({ me, body }) {
  const data = validate(requestCodeSchema, body);
  const email = (data.email ?? me.email).toLowerCase();
  if (!VERIFIED_EMAIL_DOMAINS.includes(domainOf(email))) {
    throw badRequest(`Use your university email address (${VERIFIED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')})`);
  }
  if (me.emailVerifiedAt && email === me.email) throw badRequest('This email is already verified');
  if (email !== me.email && findOne('users', (u) => u.email === email && u._id !== me._id)) {
    throw conflict('Another account already uses that email');
  }

  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  pendingStore()[me._id] = { email, code, expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(), attempts: 0 };
  save();

  // No email server in the demo: the code is returned like the backend does outside production.
  return { sentTo: maskEmail(email), expiresInMinutes: CODE_TTL_MINUTES, devCode: code };
}

function confirmCode({ me, body }) {
  const { code } = validate(confirmCodeSchema, body);
  const store = pendingStore();
  const pending = store[me._id];
  if (!pending?.code) throw badRequest('Ask for a new code first');
  if (new Date(pending.expiresAt) < new Date()) throw badRequest('That code has expired. Ask for a new one.');
  if (pending.attempts >= MAX_ATTEMPTS) throw badRequest('Too many wrong codes. Ask for a new one.');

  if (pending.code !== code) {
    pending.attempts += 1;
    save();
    const left = MAX_ATTEMPTS - pending.attempts;
    throw badRequest(left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.');
  }

  const changes = { emailVerifiedAt: nowISO() };
  if (pending.email !== me.email) {
    if (findOne('users', (u) => u.email === pending.email && u._id !== me._id)) throw conflict('Another account already uses that email');
    changes.email = pending.email;
  }
  delete store[me._id];
  update(me, changes);
  return { user: userJSON(me) };
}

/* ------------------------------ Users ------------------------------ */

/** Students and moderators who are active, excluding the viewer. Admins are not discoverable. */
const discoverable = (viewer) => (u) => u._id !== viewer._id && u.status === 'active' && u.role !== 'admin';

function updateMe({ me, body }) {
  const data = validate(updateProfileSchema, body);
  const changes = {};
  for (const [key, value] of Object.entries(data)) {
    // An empty value clears the field.
    if (value === undefined || value === null) delete me[key];
    else changes[key] = value;
  }
  update(me, changes);
  return { user: userJSON(me) };
}

function getUser({ me, params }) {
  if (!OBJECT_ID.test(params.id)) throw badRequest('Invalid _id');
  const user = byId('users', params.id);
  if (!user) throw notFound('User not found');

  const isSelf = user._id === me._id;
  const viewerIsAdmin = me.role === 'admin';
  const hidden = user.status !== 'active' || user.role === 'admin';
  if (!isSelf && !viewerIsAdmin && hidden) throw notFound('User not found');

  const match = !isSelf && isMatchable(me) ? scoreMatch(me, user) : null;
  const relation = isSelf ? null : relationFor(findConnection(me._id, user._id), me._id);
  const stats = {
    connections: connectedUserIds(user._id).length,
    posts: db.posts.filter((p) => sameId(p.author, user._id) && p.status === 'visible').length,
    communities: db.communities.filter((c) => c.status === 'active' && (c.members ?? []).some((m) => sameId(m, user._id))).length,
  };
  return {
    user: isSelf ? userJSON(user) : publicUserJSON(user),
    stats,
    ...(match && { match: { score: match.score, reasons: match.reasons, shared: match.shared } }),
    ...(relation && { relation }),
  };
}

function discover({ me, query }) {
  const { q, programme, year, interests, skills, goal, page, limit } = validate(discoverQuery, query);
  const filters = [discoverable(me)];

  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filters.push((u) => ['name', 'programme', 'bio', 'interests', 'skills'].some((f) => matchesPattern(u[f], pattern)));
  }
  if (programme) {
    const pattern = new RegExp(`^${escapeRegex(programme)}$`, 'i');
    filters.push((u) => matchesPattern(u.programme, pattern));
  }
  if (year) filters.push((u) => u.yearOfStudy === year);
  if (interests.length) filters.push((u) => interests.every((i) => (u.interests ?? []).includes(i)));
  if (skills.length) filters.push((u) => skills.every((s) => (u.skills ?? []).includes(s)));
  if (goal) filters.push((u) => (u.goals ?? []).includes(goal));

  const all = findAll('users', (u) => filters.every((f) => f(u))).sort((a, b) => desc(a.lastActiveAt, b.lastActiveAt) || desc(a._id, b._id));
  const total = all.length;
  const users = all.slice((page - 1) * limit, page * limit);

  const matchable = isMatchable(me);
  return {
    users: users.map((u) => ({ ...publicUserJSON(u), ...(matchable && { matchScore: scoreMatch(me, u).score }) })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

const CANDIDATE_POOL = 500;

function matches({ me, query }) {
  const { limit } = validate(matchesQuery, query);
  if (!isMatchable(me)) return { matches: [], profileIncomplete: true };

  // Narrow the pool to students with at least one thing in common, then score.
  const has = (list, items) => (list ?? []).some((x) => items.includes(x));
  const common = [(u) => has(u.goals, me.goals)];
  if (me.interests?.length) common.push((u) => has(u.interests, me.interests));
  if (me.skills?.length) common.push((u) => has(u.skills, me.skills));
  if (me.programme) {
    const pattern = new RegExp(`^${escapeRegex(me.programme)}$`, 'i');
    common.push((u) => matchesPattern(u.programme, pattern));
  }

  // Skip anyone already connected or with a pending/declined request.
  const exclude = new Set([me._id, ...relatedUserIds(me._id).map(String)]);
  const isDiscoverable = discoverable(me);
  const candidates = findAll('users', (u) => isDiscoverable(u) && !exclude.has(u._id) && common.some((f) => f(u)))
    .sort((a, b) => desc(a.lastActiveAt, b.lastActiveAt))
    .slice(0, CANDIDATE_POOL);

  const ranked = rankMatches(me, candidates, { limit });
  return {
    matches: ranked.map((m) => ({ user: publicUserJSON(m.user), score: m.score, reasons: m.reasons, shared: m.shared })),
    profileIncomplete: false,
  };
}

/* ------------------------------ Avatar ------------------------------ */

async function setAvatar({ me, formData }) {
  const file = formData?.get?.('photo');
  if (!file || typeof file === 'string') throw badRequest('Choose a photo to upload');
  const url = await fileToDataUrl(file);
  update(me, { avatarUrl: url });
  return { user: userJSON(me) };
}

function removeAvatar({ me }) {
  delete me.avatarUrl;
  update(me);
  return { user: userJSON(me) };
}

/* ------------------------------ Meta ------------------------------ */

const DEFAULT_PROGRAMMES = [
  'Computer Science',
  'Information Systems',
  'Telecommunications',
  'Economics',
  'Accounting',
  'Management',
  'Law',
  'Medicine and Surgery',
  'Nursing',
  'Public Health',
  'Agriculture',
  'Biology',
  'Chemistry',
  'Physics',
  'Mathematics',
  'English',
  'Political Science',
  'Development Studies',
];
const DEFAULT_INTERESTS = ['technology', 'entrepreneurship', 'football', 'research', 'photography', 'music', 'reading', 'debate'];
const DEFAULT_SKILLS = ['web development', 'python', 'graphic design', 'public speaking', 'data analysis', 'writing'];

function popular(field, limit) {
  const counts = new Map();
  for (const u of db.users) {
    if (u.status !== 'active') continue;
    for (const v of u[field] ?? []) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([value]) => value);
}

const merge = (...lists) => {
  const seen = new Map();
  for (const item of lists.flat()) {
    const key = item.toLowerCase();
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
};

function options() {
  const programmes = [...new Set(db.users.filter((u) => u.status === 'active' && u.programme).map((u) => u.programme))];
  return {
    goals: CONNECTION_GOALS,
    prompts: PROFILE_PROMPTS,
    programmes: merge(DEFAULT_PROGRAMMES, programmes).sort((a, b) => a.localeCompare(b)),
    interests: merge(popular('interests', 30), DEFAULT_INTERESTS),
    skills: merge(popular('skills', 30), DEFAULT_SKILLS),
  };
}

/* ------------------------------ Search ------------------------------ */

// Same as communityController.serializeCommunity.
function serializeCommunity(community, viewer) {
  const { members, ...json } = cleanJSON(community);
  return {
    ...json,
    isMember: (members ?? []).some((m) => sameId(m, viewer._id)),
    canModerate: canModerateCommunity(viewer, community),
  };
}

// Same as postController.serializePost (author and community populated).
function serializePost(post, viewer) {
  const author = byId('users', post.author);
  const community = post.community ? byId('communities', post.community) : null;
  const own = Boolean(author && author._id === viewer._id);
  const moderates = isAdmin(viewer) || (community && canModerateCommunity(viewer, community));
  return {
    id: post._id,
    content: post.content,
    author: author
      ? {
          id: author._id,
          name: author.name,
          avatarUrl: author.avatarUrl,
          programme: author.programme,
          yearOfStudy: author.yearOfStudy,
          role: author.role,
          isVerified: Boolean(author.emailVerifiedAt),
        }
      : null,
    community: community && { id: community._id, name: community.name, slug: community.slug },
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByMe: (post.likes ?? []).some((id) => sameId(id, viewer._id)),
    pinned: post.pinned,
    createdAt: post.createdAt,
    isAuthor: own,
    canDelete: own || Boolean(moderates),
    canPin: Boolean(community) && Boolean(moderates),
  };
}

function search({ me, query }) {
  const { q, type, limit } = validate(searchQuery, query);
  const pattern = new RegExp(escapeRegex(q), 'i');
  const each = type === 'all' ? Math.min(limit, 5) : limit;
  const want = (kind) => type === 'all' || type === kind;

  const people = want('people')
    ? findAll(
        'users',
        (u) =>
          u._id !== me._id &&
          u.status === 'active' &&
          u.role !== 'admin' &&
          ['name', 'programme', 'interests', 'skills'].some((f) => matchesPattern(u[f], pattern)),
      )
        // Verified and recently active first; names starting with the query are moved up below.
        .sort((a, b) => desc(a.emailVerifiedAt, b.emailVerifiedAt) || desc(a.lastActiveAt, b.lastActiveAt))
        .slice(0, each * 3)
    : [];

  const communities = want('communities')
    ? findAll('communities', (c) => c.status === 'active' && ['name', 'description', 'category'].some((f) => matchesPattern(c[f], pattern)))
        .sort((a, b) => desc(a.memberCount ?? 0, b.memberCount ?? 0))
        .slice(0, each)
    : [];

  let posts = [];
  if (want('posts')) {
    const readable = new Set(db.communities.filter((c) => READABLE_COMMUNITY.includes(c.status)).map((c) => c._id));
    posts = findAll(
      'posts',
      (p) => p.status === 'visible' && typeof p.content === 'string' && pattern.test(p.content) && (!p.community || readable.has(String(p.community))),
    )
      .sort((a, b) => desc(a.likeCount ?? 0, b.likeCount ?? 0) || desc(a.createdAt, b.createdAt))
      .slice(0, each);
  }

  const starts = new RegExp(`^${escapeRegex(q)}`, 'i');
  const rankedPeople = people.sort((a, b) => Number(starts.test(b.name)) - Number(starts.test(a.name))).slice(0, each);
  const matchable = isMatchable(me);

  return {
    q,
    people: rankedPeople.map((u) => ({ ...publicUserJSON(u), ...(matchable && { matchScore: scoreMatch(me, u).score }) })),
    communities: communities.map((c) => serializeCommunity(c, me)),
    posts: posts.map((p) => serializePost(p, me)),
  };
}

/* ------------------------------ Routes ------------------------------ */

register([
  ['POST', '/auth/register', registerUser, { public: true }],
  ['POST', '/auth/login', login, { public: true }],
  ['GET', '/auth/me', ({ me }) => ({ user: userJSON(me) })],
  ['PATCH', '/auth/password', changePassword],
  ['POST', '/auth/verify-email/request', requestCode],
  ['POST', '/auth/verify-email/confirm', confirmCode],

  ['PATCH', '/users/me', updateMe],
  ['PUT', '/users/me/avatar', setAvatar],
  ['DELETE', '/users/me/avatar', removeAvatar],
  ['GET', '/users', discover],
  ['GET', '/users/:id', getUser],

  ['GET', '/matches', matches],
  ['GET', '/meta/options', options],
  ['GET', '/search', search],
]);
