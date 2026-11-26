import { Connection, CONNECTION_STATUS } from '../models/Connection.js';
import { User } from '../models/User.js';
import { Community, COMMUNITY_STATUS } from '../models/Community.js';
import { ACCOUNT_STATUS, ROLES } from '../config/roles.js';
import { relatedUserIds } from './connections.js';
import { byScore, diversify, normalize, peopleScore, relationshipStrength } from './rankingMath.js';

const active = { status: ACCOUNT_STATUS.ACTIVE, role: { $ne: ROLES.ADMIN } };

export async function rankingExclusions(viewer) {
  const inbound = await User.distinct('_id', { rankingExcludedUsers: viewer._id });
  return [...new Set([...(viewer.rankingExcludedUsers ?? []), ...inbound].map(String))];
}

/** Bound the two-hop expansion independently of the total graph size. */
export async function graphContext(viewer, excluded = []) {
  const id = String(viewer._id);
  const exclude = new Set(excluded.map(String));
  const direct = await Connection.find({
    status: CONNECTION_STATUS.ACCEPTED,
    $or: [{ requester: viewer._id }, { recipient: viewer._id }],
  }, 'requester recipient').sort({ _id: -1 }).limit(150);
  const directIds = direct.map((row) => String(row.otherUser(id))).filter((user) => !exclude.has(user));
  const connected = new Set((await User.distinct('_id', { _id: { $in: directIds }, status: ACCOUNT_STATUS.ACTIVE })).map(String));
  const neighbors = [...connected];
  const [edges, communities] = await Promise.all([
    neighbors.length ? Connection.find({
      status: CONNECTION_STATUS.ACCEPTED,
      $or: [{ requester: { $in: neighbors } }, { recipient: { $in: neighbors } }],
    }, 'requester recipient').sort({ _id: -1 }).limit(3000).lean() : [],
    Community.find({ status: COMMUNITY_STATUS.ACTIVE, members: viewer._id }, { category: 1, members: { $slice: 500 } })
      .sort({ _id: -1 }).limit(40).lean(),
  ]);
  const mutual = new Map();
  for (const { requester, recipient } of edges) {
    const a = String(requester);
    const b = String(recipient);
    if (connected.has(a) && b !== id && !exclude.has(b)) mutual.set(b, (mutual.get(b) ?? 0) + 1);
    if (connected.has(b) && a !== id && !exclude.has(a)) mutual.set(a, (mutual.get(a) ?? 0) + 1);
  }
  const shared = new Map();
  for (const community of communities) {
    for (const member of community.members) {
      const key = String(member);
      if (key !== id && !exclude.has(key)) shared.set(key, (shared.get(key) ?? 0) + 1);
    }
  }
  return { connected, mutual, shared, communities };
}

export async function recommendPeople(viewer, limit, now = Date.now()) {
  const [excluded, related] = await Promise.all([rankingExclusions(viewer), relatedUserIds(viewer._id)]);
  const graph = await graphContext(viewer, excluded);
  const omit = [viewer._id, ...related, ...excluded];
  const allowed = { ...active, discoverable: { $ne: false } };
  const pool = (filter, cap) => User.find({
    ...allowed,
    $and: [{ _id: { $nin: omit } }, filter],
  }).sort({ lastActiveAt: -1, _id: 1 }).limit(cap);
  const topIds = (map) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 180).map(([id]) => id);
  const pools = await Promise.all([
    graph.mutual.size ? pool({ _id: { $in: topIds(graph.mutual) } }, 180) : [],
    graph.shared.size ? pool({ _id: { $in: topIds(graph.shared) } }, 100) : [],
    viewer.interests.length ? pool({ interests: { $in: viewer.interests } }, 100) : [],
    viewer.programme ? pool({ programme: viewer.programme }, 60) : [],
    viewer.yearOfStudy ? pool({ yearOfStudy: viewer.yearOfStudy }, 60) : [],
    pool(viewer.programme ? { programme: { $ne: viewer.programme } } : {}, 50),
  ]);
  const candidates = new Map(pools.flat().map((user) => [user.id, user]));
  const ranked = [...candidates.values()].map((user) => {
    const mutual = graph.mutual.get(user.id) ?? 0;
    const sharedCommunities = graph.shared.get(user.id) ?? 0;
    const proximity = relationshipStrength({ connected: false, mutual, communities: sharedCommunities }, now);
    return { id: user.id, user, programme: normalize(user.programme), ...peopleScore(viewer, user, { mutual, sharedCommunities, proximity, now }) };
  }).sort((a, b) => b.score - a.score || b.proximity - a.proximity || byScore(a, b));
  const ordered = diversify(ranked, { groupKey: 'programme', authorDistance: 0 });
  if (limit > 1 && viewer.programme && !graph.connected.size) {
    const programme = normalize(viewer.programme);
    const position = Math.min(limit - 1, 2);
    const alternate = ordered.findIndex((row) => row.programme && row.programme !== programme);
    if (alternate > position) ordered.splice(position, 0, ...ordered.splice(alternate, 1));
  }
  return ordered.slice(0, limit)
    .map(({ user, score, reasons }) => ({ user: user.toPublicJSON(), score: Math.round(score * 100), reasons }));
}
