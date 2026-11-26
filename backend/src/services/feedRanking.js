import { Post, Comment, CONTENT_STATUS } from '../models/Post.js';
import { Community, COMMUNITY_STATUS } from '../models/Community.js';
import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { FeedDismissal } from '../models/FeedDismissal.js';
import { ACCOUNT_STATUS } from '../config/roles.js';
import { rankingConfig } from '../config/ranking.js';
import { graphContext, rankingExclusions } from './peopleRanking.js';
import {
  DAY, ageHours, byScore, decay, diversify, engagementQuality, interestRelevance,
  normalize, relationshipStrength, trendingScore, weighted,
} from './rankingMath.js';

const readable = [COMMUNITY_STATUS.ACTIVE, COMMUNITY_STATUS.ARCHIVED];
const limit = 160;
const visible = CONTENT_STATUS.VISIBLE;
const stringify = (value) => String(value);
const dayStart = (now) => Math.floor(now / DAY) * DAY;

export async function rankingVisibility(viewer) {
  const [communities, excluded] = await Promise.all([
    Community.distinct('_id', { status: { $in: readable } }),
    rankingExclusions(viewer),
  ]);
  return {
    excluded,
    filter: { status: visible, author: { $nin: excluded }, $or: [{ community: null }, { community: { $in: communities } }] },
  };
}

export async function eligiblePosts(viewer, posts) {
  const [authors, dismissed] = await Promise.all([
    User.find({ _id: { $in: posts.map((post) => post.author) }, status: ACCOUNT_STATUS.ACTIVE },
      'programme interests').lean(),
    FeedDismissal.find({ viewer: viewer._id, post: { $in: posts.map((post) => post._id) } }, 'post').lean(),
  ]);
  const people = new Map(authors.map((author) => [String(author._id), author]));
  const hidden = new Set(dismissed.map((row) => String(row.post)));
  return { people, posts: posts.filter((post) => people.has(String(post.author)) && !hidden.has(String(post._id))) };
}

/** One active account per post, and one recent timestamp per account, regardless of comment count. */
async function commentParticipants(posts, since, excluded) {
  const groups = await Comment.aggregate([
    { $match: { post: { $in: posts.map((post) => post._id) }, status: visible, createdAt: { $gte: since } } },
    { $group: { _id: { post: '$post', author: '$author' }, latest: { $max: '$createdAt' } } },
  ]);
  const authors = await User.distinct('_id', {
    _id: { $in: [...new Set(groups.map((entry) => String(entry._id.author)))], $nin: excluded },
    status: ACCOUNT_STATUS.ACTIVE,
  });
  const active = new Set(authors.map(stringify));
  const map = new Map();
  for (const { _id: { post, author }, latest } of groups) {
    if (!active.has(String(author))) continue;
    const key = String(post);
    if (!map.has(key)) map.set(key, new Map());
    map.get(key).set(String(author), latest);
  }
  return map;
}

const candidateFields = 'author community content likes createdAt';
const newest = { createdAt: -1, _id: -1 };
const recent = (filter) => Post.find(filter).select(candidateFields).sort(newest).limit(limit).lean();

function interactionDates(posts, comments, viewer) {
  const outgoing = new Map();
  const incoming = new Map();
  const record = (map, id, date) => {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(date);
  };
  for (const post of posts) {
    const author = String(post.author);
    const participants = comments.get(String(post._id));
    if (!participants) continue;
    if (author === viewer) {
      for (const [actor, date] of participants) if (actor !== viewer) record(incoming, actor, date);
    } else if (participants.has(viewer)) record(outgoing, author, participants.get(viewer));
  }
  for (const map of [outgoing, incoming]) for (const dates of map.values()) dates.sort((a, b) => b - a);
  return { outgoing, incoming };
}

function activeLikes(post, active, since = 0) {
  const author = String(post.author);
  return [...new Set(post.likes.map(stringify))].filter((id) =>
    id !== author && active.has(id) && (!since || new Date(post.likeTimes?.[id] ?? 0).getTime() >= since));
}

function candidateRow(post) {
  return { id: String(post._id), author: String(post.author), community: post.community && String(post.community), created: +post.createdAt };
}

export async function buildFeed(viewer, visibility, now) {
  const id = String(viewer._id);
  const graph = await graphContext(viewer, visibility.excluded);
  const myCommunities = new Set(graph.communities.map((community) => String(community._id)));
  const network = [...graph.connected, id];
  const [inside, campus, own] = await Promise.all([
    recent({ $and: [visibility.filter, { $or: [{ author: { $in: network } }, { community: { $in: [...myCommunities] } }] }] }),
    recent(visibility.filter),
    recent({ ...visibility.filter, author: viewer._id }),
  ]);
  const pool = [...new Map([...inside, ...campus].map((post) => [String(post._id), post])).values()];
  const { people, posts } = await eligiblePosts(viewer, pool);
  const interactionPool = [...new Map([...posts, ...own].filter((post) => ageHours(post.createdAt, now) <= 30 * 24)
    .map((post) => [String(post._id), post])).values()];
  const likeIds = [...new Set(posts.flatMap((post) => post.likes.map(stringify)))];
  const [comments, communities, active, feedback] = await Promise.all([
    commentParticipants(interactionPool, new Date(now - 30 * DAY), visibility.excluded),
    Community.find({ _id: { $in: posts.map((p) => p.community).filter(Boolean) } }, 'name description category').lean(),
    User.distinct('_id', { _id: { $in: likeIds, $nin: visibility.excluded }, status: ACCOUNT_STATUS.ACTIVE }),
    Report.distinct('targetId', { targetType: 'post', targetId: { $in: posts.map((p) => p._id) }, status: 'resolved', action: 'user_warned' }),
  ]);
  const activeSet = new Set(active.map(stringify));
  const penalized = new Set(feedback.map(stringify));
  const communityMap = new Map(communities.map((community) => [String(community._id), community]));
  const { outgoing, incoming } = interactionDates(interactionPool, comments, id);
  const categories = new Set(graph.communities.map((community) => community.category));
  const coldStart = !graph.connected.size && !myCommunities.size && !viewer.interests.length;
  const ranked = [];
  for (const post of posts) {
    const row = candidateRow(post);
    const author = people.get(row.author);
    const community = communityMap.get(row.community);
    const connected = graph.connected.has(row.author);
    const member = myCommunities.has(row.community);
    const outside = !connected && !member && row.author !== id;
    const participants = [...(comments.get(row.id)?.keys() ?? [])].filter((actor) => actor !== row.author);
    const interest = interestRelevance(post.content, viewer.interests, author.interests);
    const engagement = engagementQuality(activeLikes(post, activeSet).length, participants.length);
    const relevance = member ? 1 : community ? Math.max(categories.has(community.category) ? 0.35 : 0,
      interestRelevance([community.name, community.category, community.description].filter(Boolean).join(' '), viewer.interests, [])) : 0;
    const recency = decay(ageHours(post.createdAt, now));
    const relationship = row.author === id ? 1 : relationshipStrength({
      connected, mutual: graph.mutual.get(row.author), communities: graph.shared.get(row.author),
      outgoing: outgoing.get(row.author), incoming: incoming.get(row.author),
    }, now);
    const discussion = participants.some((actor) => graph.connected.has(actor));
    const differentProgramme = viewer.programme && author.programme && normalize(author.programme) !== normalize(viewer.programme);
    const text = normalize(post.content);
    const freshCampusPost = coldStart && !row.community && recency >= Math.exp(-1)
      && text.length >= 45 && !penalized.has(row.id);
    const discovery = outside && recency >= 0.02 && (
      interest >= 0.2 || relevance >= 0.35 || (engagement >= 0.35 && participants.length >= 2) || freshCampusPost
    );
    if (outside && !discovery) continue;
    const exploration = discovery ? Math.min(1, Math.max(interest, relevance, engagement) + (differentProgramme ? 0.15 : 0)) : 0;
    const score = weighted({ relationship, interest, engagement, recency, community: relevance, discovery: exploration }, rankingConfig.feed)
      * (penalized.has(row.id) ? 0.8 : 1);
    ranked.push({ ...row, score, discovery, category: community?.category, discussion, engagement, recency, relevance, relationship, text });
  }

  ranked.sort(byScore);
  // Give equivalent exploration candidates a predictable daily rotation.
  const day = Math.floor(now / DAY);
  const rotation = (id) => (Number.parseInt(id.slice(-6), 16) + day * 71) % 997;
  const exploration = ranked.filter((row) => row.discovery).sort((a, b) =>
    Math.floor(b.score * 25) - Math.floor(a.score * 25) || rotation(a.id) - rotation(b.id) || byScore(a, b));
  const shown = new Set();
  const deduplicated = [...ranked.filter((row) => !row.discovery), ...exploration].filter((row) => {
    const key = row.author + ':' + row.text;
    if (shown.has(key)) return false;
    shown.add(key);
    return true;
  });
  const order = diversify(deduplicated, { share: rankingConfig.discoveryShare });

  const highlights = [];
  const used = new Set();
  const usedAuthors = new Set();
  const significant = ranked.filter((row) => row.recency >= 0.1 && (row.discussion
    || (row.relevance > 0 && row.engagement >= 0.35) || row.relationship >= 0.5));
  significant.sort((a, b) => (b.score + 0.15 * Number(b.discussion) + 0.1 * b.engagement)
    - (a.score + 0.15 * Number(a.discussion) + 0.1 * a.engagement) || byScore(a, b));
  for (const row of significant) {
    if (used.has(row.text) || usedAuthors.has(row.author) || (row.community && used.has(row.community))) continue;
    used.add(row.text);
    if (row.community) used.add(row.community);
    usedAuthors.add(row.author);
    highlights.push({ id: row.id, reason: row.discussion ? 'Your connections are discussing this'
      : row.relevance > 0 && row.engagement >= 0.35 ? 'Active discussion in a relevant community' : 'Recent activity from a close connection' });
    if (highlights.length === 3) break;
  }
  return { ids: order.map((row) => row.id), discoveryIds: new Set(order.filter((row) => row.discovery).map((row) => row.id)), highlights };
}

export async function buildTrending(viewer, visibility, now, window) {
  const since = window === 'today' ? dayStart(now) : now - 7 * DAY;
  const [commented, liked] = await Promise.all([
    Comment.aggregate([
      { $match: { status: visible, createdAt: { $gte: new Date(since) } } },
      { $group: { _id: '$post', latest: { $max: '$createdAt' } } },
      { $sort: { latest: -1, _id: 1 } },
      { $limit: 250 },
    ]),
    Post.find({ ...visibility.filter, lastLikedAt: { $gte: new Date(since) } })
      .sort({ lastLikedAt: -1, _id: -1 }).limit(250).select('_id').lean(),
  ]);
  const candidates = await Post.find({ ...visibility.filter, _id: { $in: [...commented, ...liked].map((row) => row._id) } })
    .select(candidateFields + ' likeTimes').lean();
  const { posts } = await eligiblePosts(viewer, candidates);
  const [comments, activeUsers] = await Promise.all([
    commentParticipants(posts, new Date(since), visibility.excluded),
    User.distinct('_id', { _id: { $in: [...new Set(posts.flatMap((post) => post.likes.map(stringify)))], $nin: visibility.excluded }, status: ACCOUNT_STATUS.ACTIVE }),
  ]);
  const active = new Set(activeUsers.map(stringify));
  const ranked = posts.map((post) => {
    const row = candidateRow(post);
    const likes = activeLikes(post, active, since);
    const commenters = [...(comments.get(row.id)?.keys() ?? [])].filter((id) => id !== row.author);
    const participants = new Set([...likes, ...commenters]).size;
    return { ...row, score: trendingScore({ likes: likes.length, commenters: commenters.length, participants, age: ageHours(post.createdAt, now) }) };
  }).filter((row) => row.score > 0).sort(byScore);
  return { ids: diversify(ranked).map((row) => row.id), highlights: [] };
}
