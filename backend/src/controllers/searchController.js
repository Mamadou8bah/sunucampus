import { User } from '../models/User.js';
import { Community, COMMUNITY_STATUS } from '../models/Community.js';
import { Post, CONTENT_STATUS } from '../models/Post.js';
import { ROLES, ACCOUNT_STATUS } from '../config/roles.js';
import { isMatchable, scoreMatch } from '../utils/matching.js';
import { serializeCommunity } from './communityController.js';
import { POPULATE, READABLE_COMMUNITY, serializePost } from './postController.js';
import { rankingExclusions } from '../services/peopleRanking.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One search box for everything (like Instagram or X): students, communities and posts.
 * `type=all` returns a few of each; a specific type returns a longer list of that kind.
 */
export async function search(req, res) {
  const { q, type, limit } = req.validated.query;
  const pattern = new RegExp(escapeRegex(q), 'i');
  const me = req.user;
  const each = type === 'all' ? Math.min(limit, 5) : limit;
  const want = (kind) => type === 'all' || type === kind;

  const [people, communities, posts] = await Promise.all([
    want('people')
      ? rankingExclusions(me).then((exclude) => User.find({
          _id: { $nin: [me._id, ...exclude] },
          discoverable: { $ne: false },
          status: ACCOUNT_STATUS.ACTIVE,
          role: { $ne: ROLES.ADMIN },
          $or: [{ name: pattern }, { programme: pattern }, { interests: pattern }, { skills: pattern }],
        })
          // Verified and recently active first; names starting with the query are moved up below.
          .sort({ emailVerifiedAt: -1, lastActiveAt: -1 })
          .limit(each * 3))
      : [],
    want('communities')
      ? Community.find({ status: COMMUNITY_STATUS.ACTIVE, $or: [{ name: pattern }, { description: pattern }, { category: pattern }] })
          .sort({ memberCount: -1 })
          .limit(each)
      : [],
    want('posts')
      ? (async () => {
          const readable = await Community.find({ status: { $in: READABLE_COMMUNITY } }).distinct('_id');
          return Post.find({
            status: CONTENT_STATUS.VISIBLE,
            content: pattern,
            $or: [{ community: null }, { community: { $in: readable } }],
          })
            .sort({ likeCount: -1, createdAt: -1 })
            .limit(each)
            .populate(POPULATE);
        })()
      : [],
  ]);

  const starts = new RegExp(`^${escapeRegex(q)}`, 'i');
  const rankedPeople = people
    .sort((a, b) => Number(starts.test(b.name)) - Number(starts.test(a.name)))
    .slice(0, each);
  const matchable = isMatchable(me);

  res.json({
    q,
    people: rankedPeople.map((u) => ({ ...u.toPublicJSON(), ...(matchable && { matchScore: scoreMatch(me, u).score }) })),
    communities: communities.map((c) => serializeCommunity(c, me)),
    posts: posts.map((p) => serializePost(p, me)),
  });
}
