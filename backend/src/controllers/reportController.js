import { Report, REPORT_STATUS } from '../models/Report.js';
import { Post, Comment, CONTENT_STATUS } from '../models/Post.js';
import { Listing, LISTING_STATUS } from '../models/Listing.js';
import { Community } from '../models/Community.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

const TARGET_MODELS = { post: Post, comment: Comment, community: Community, user: User, listing: Listing };

/** Students report posts, comments, communities or profiles; reports go to the admin queue. */
export async function create(req, res) {
  const { targetType, targetId, reason, details } = req.body;
  const target = await TARGET_MODELS[targetType].findById(targetId);
  const gone =
    !target ||
    (['post', 'comment'].includes(targetType) && target.status !== CONTENT_STATUS.VISIBLE) ||
    (targetType === 'listing' && ![LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD].includes(target.status));
  if (gone) throw ApiError.notFound('That content no longer exists');
  if (targetType === 'user' && target._id.equals(req.user._id)) throw ApiError.badRequest('You cannot report yourself');
  if (targetType === 'listing' && target.seller.equals(req.user._id)) throw ApiError.badRequest('You cannot report your own listing');

  const existing = await Report.findOne({ reporter: req.user._id, targetType, targetId, status: REPORT_STATUS.OPEN });
  if (existing) return res.status(200).json({ report: { id: existing.id, status: existing.status }, duplicate: true });

  const report = await Report.create({ reporter: req.user._id, targetType, targetId, reason, details });
  res.status(201).json({ report: { id: report.id, status: report.status } });
}
