import { User } from '../models/User.js';
import { ROLES, ACCOUNT_STATUS } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { rankMatches, isMatchable, scoreMatch } from '../utils/matching.js';
import { connectedUserIds, findConnection, relatedUserIds, relationFor } from '../services/connections.js';
import { Post, CONTENT_STATUS } from '../models/Post.js';
import { Community, COMMUNITY_STATUS } from '../models/Community.js';
import { rankingExclusions, recommendPeople } from '../services/peopleRanking.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Students and moderators who are active, excluding the viewer. Admins are staff, not discoverable. */
const discoverableFilter = (viewer) => ({
  _id: { $ne: viewer._id },
  discoverable: { $ne: false },
  status: ACCOUNT_STATUS.ACTIVE,
  role: { $ne: ROLES.ADMIN },
});

export async function updateMe(req, res) {
  const updates = { ...req.body };
  const unset = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) {
      // An empty value clears the field.
      if (key in req.body) unset[key] = 1;
      delete updates[key];
    }
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates, ...(Object.keys(unset).length && { $unset: unset }) },
    { returnDocument: 'after', runValidators: true },
  );
  res.json({ user });
}

export async function getUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const isSelf = user.id === req.user.id;
  const viewerIsAdmin = req.user.role === ROLES.ADMIN;
  const hidden = user.status !== ACCOUNT_STATUS.ACTIVE || user.role === ROLES.ADMIN;
  if (!isSelf && !viewerIsAdmin && hidden) throw ApiError.notFound('User not found');

  const match = !isSelf && isMatchable(req.user) ? scoreMatch(req.user, user) : null;
  const relation = isSelf ? null : relationFor(await findConnection(req.user._id, user._id), req.user._id);
  const [connections, posts, communities] = await Promise.all([
    connectedUserIds(user._id).then((ids) => ids.length),
    Post.countDocuments({ author: user._id, status: CONTENT_STATUS.VISIBLE }),
    Community.countDocuments({ members: user._id, status: COMMUNITY_STATUS.ACTIVE }),
  ]);
  res.json({
    user: isSelf ? user.toJSON() : user.toPublicJSON(),
    stats: { connections, posts, communities },
    ...(match && { match: { score: match.score, reasons: match.reasons, shared: match.shared } }),
    ...(relation && { relation }),
  });
}

export async function discover(req, res) {
  const { q, programme, year, interests, skills, goal, page, limit } = req.validated.query;
  const filter = discoverableFilter(req.user);
  filter._id.$nin = await rankingExclusions(req.user);

  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { programme: pattern }, { bio: pattern }, { interests: pattern }, { skills: pattern }];
  }
  if (programme) filter.programme = new RegExp(`^${escapeRegex(programme)}$`, 'i');
  if (year) filter.yearOfStudy = year;
  if (interests.length) filter.interests = { $all: interests };
  if (skills.length) filter.skills = { $all: skills };
  if (goal) filter.goals = goal;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ lastActiveAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  const matchable = isMatchable(req.user);
  res.json({
    users: users.map((u) => ({
      ...u.toPublicJSON(),
      ...(matchable && { matchScore: scoreMatch(req.user, u).score }),
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

const CANDIDATE_POOL = 500;

export async function matches(req, res) {
  const me = req.user;
  if (!isMatchable(me)) {
    return res.json({ matches: [], profileIncomplete: true });
  }

  // Narrow the pool to students with at least one thing in common, then score in memory.
  const common = [{ goals: { $in: me.goals } }];
  if (me.interests.length) common.push({ interests: { $in: me.interests } });
  if (me.skills.length) common.push({ skills: { $in: me.skills } });
  if (me.programme) common.push({ programme: new RegExp(`^${escapeRegex(me.programme)}$`, 'i') });

  // Skip anyone I'm already connected to or have a pending/declined request with.
  const [related, excluded] = await Promise.all([relatedUserIds(me._id), rankingExclusions(me)]);
  const exclude = [me._id, ...related, ...excluded];
  const candidates = await User.find({ ...discoverableFilter(me), _id: { $nin: exclude }, $or: common })
    .sort({ lastActiveAt: -1 })
    .limit(CANDIDATE_POOL);

  const ranked = rankMatches(me, candidates, { limit: req.validated.query.limit });
  res.json({
    matches: ranked.map((m) => ({ user: m.user.toPublicJSON(), score: m.score, reasons: m.reasons, shared: m.shared })),
    profileIncomplete: false,
  });
}

export async function peopleYouMayKnow(req, res) {
  res.json({ recommendations: await recommendPeople(req.user, req.validated.query.limit) });
}
