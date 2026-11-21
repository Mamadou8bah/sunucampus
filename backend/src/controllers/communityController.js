import mongoose from 'mongoose';
import { Community, COMMUNITY_STATUS, slugify } from '../models/Community.js';
import { User } from '../models/User.js';
import { ROLES } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { canModerateCommunity, canViewCommunity, isAdmin } from '../services/permissions.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function serializeCommunity(community, viewer) {
  return {
    ...community.toJSON(),
    isMember: community.isMember(viewer._id),
    canModerate: canModerateCommunity(viewer, community),
  };
}

/** Accepts either an id or a slug in the URL. */
export async function loadCommunity(idOrSlug, viewer) {
  const query = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() };
  const community = await Community.findOne(query);
  if (!community || !canViewCommunity(viewer, community)) throw ApiError.notFound('Community not found');
  return community;
}

async function loadModeratable(req) {
  const community = await loadCommunity(req.params.id, req.user);
  if (!canModerateCommunity(req.user, community)) throw ApiError.forbidden('Only this community’s moderators can do that');
  return community;
}

export async function create(req, res) {
  const { name, category, description } = req.body;
  const slug = slugify(name);
  if (!slug) throw ApiError.badRequest('Choose a name with letters or numbers');
  if (await Community.exists({ slug })) throw ApiError.conflict('A community with that name already exists');

  const me = req.user;
  const autoApprove = isAdmin(me);
  const community = await Community.create({
    name,
    slug,
    category,
    description,
    creator: me._id,
    moderators: [me._id],
    members: [me._id],
    memberCount: 1,
    status: autoApprove ? COMMUNITY_STATUS.ACTIVE : COMMUNITY_STATUS.PENDING,
    ...(autoApprove && { reviewedBy: me._id, reviewedAt: new Date() }),
  });
  res.status(201).json({ community: serializeCommunity(community, me) });
}

export async function list(req, res) {
  const { q, category, mine, page, limit } = req.validated.query;
  const me = req.user;

  const filter =
    mine === 'true'
      ? // My communities, including ones I created that are still awaiting approval.
        { $or: [{ members: me._id, status: { $in: [COMMUNITY_STATUS.ACTIVE, COMMUNITY_STATUS.ARCHIVED] } }, { creator: me._id }] }
      : { status: COMMUNITY_STATUS.ACTIVE };
  if (category) filter.category = category;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$and = [{ $or: [{ name: pattern }, { description: pattern }] }];
  }

  const [communities, total] = await Promise.all([
    Community.find(filter).sort({ memberCount: -1, name: 1 }).skip((page - 1) * limit).limit(limit),
    Community.countDocuments(filter),
  ]);

  res.json({
    communities: communities.map((c) => serializeCommunity(c, me)),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

export async function get(req, res) {
  const community = await loadCommunity(req.params.id, req.user);
  const data = serializeCommunity(community, req.user);
  await community.populate('moderators', 'name avatarUrl programme yearOfStudy emailVerifiedAt');
  data.moderators = community.moderators.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: m.avatarUrl,
    programme: m.programme,
    yearOfStudy: m.yearOfStudy,
    isVerified: Boolean(m.emailVerifiedAt),
  }));
  res.json({ community: data });
}

export async function update(req, res) {
  const community = await loadModeratable(req);
  Object.assign(community, req.body);
  await community.save();
  res.json({ community: serializeCommunity(community, req.user) });
}

export async function join(req, res) {
  const community = await loadCommunity(req.params.id, req.user);
  if (community.status !== COMMUNITY_STATUS.ACTIVE) throw ApiError.badRequest('This community is not open for new members');

  // Atomic: only adds and counts the member once.
  const updated = await Community.findOneAndUpdate(
    { _id: community._id, members: { $ne: req.user._id } },
    { $push: { members: req.user._id }, $inc: { memberCount: 1 } },
    { returnDocument: 'after' },
  );
  res.json({ community: serializeCommunity(updated ?? community, req.user) });
}

export async function leave(req, res) {
  const community = await loadCommunity(req.params.id, req.user);
  const me = req.user._id;
  if (community.isModerator(me) && community.moderators.length === 1 && community.memberCount > 1) {
    throw ApiError.badRequest('Appoint another moderator before leaving this community');
  }

  const updated = await Community.findOneAndUpdate(
    { _id: community._id, members: me },
    { $pull: { members: me, moderators: me }, $inc: { memberCount: -1 } },
    { returnDocument: 'after' },
  );
  res.json({ community: serializeCommunity(updated ?? community, req.user) });
}

export async function members(req, res) {
  const community = await loadCommunity(req.params.id, req.user);
  await community.populate({ path: 'members', select: 'name avatarUrl programme yearOfStudy role emailVerifiedAt', options: { limit: 200 } });
  res.json({
    members: community.members.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl,
      programme: m.programme,
      yearOfStudy: m.yearOfStudy,
      isVerified: Boolean(m.emailVerifiedAt),
      isModerator: community.moderators.some((id) => id.equals(m._id)),
    })),
    total: community.memberCount,
  });
}

export async function addModerator(req, res) {
  const community = await loadModeratable(req);
  const { userId } = req.body;
  if (!community.isMember(userId)) throw ApiError.badRequest('Only members can be appointed as moderators');

  if (!community.isModerator(userId)) {
    community.moderators.push(userId);
    await community.save();
    // Appointed students gain the platform-wide moderator role (docs/PROPOSAL.md §4.2).
    await User.updateOne({ _id: userId, role: ROLES.STUDENT }, { role: ROLES.MODERATOR });
  }
  res.json({ community: serializeCommunity(community, req.user) });
}

export async function removeModerator(req, res) {
  const community = await loadModeratable(req);
  const { userId } = req.params;
  if (community.moderators.length === 1 && community.isModerator(userId)) {
    throw ApiError.badRequest('A community needs at least one moderator');
  }
  community.moderators = community.moderators.filter((m) => !m.equals(userId));
  await community.save();
  res.json({ community: serializeCommunity(community, req.user) });
}
