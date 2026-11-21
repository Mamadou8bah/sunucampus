import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Notification } from '../models/Notification.js';
import { populateNotification, serializeNotification, unreadCount } from '../services/notifications.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const listQuery = z.object({
  before: z.iso.datetime().optional(), // cursor: updatedAt of the last item shown
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
const readSchema = z.object({ ids: z.array(objectId).max(100).optional() });

const router = Router();
router.use(authenticate);

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { before, limit } = req.validated.query;
  const filter = { recipient: req.user._id, ...(before && { updatedAt: { $lt: new Date(before) } }) };
  const items = await populateNotification(Notification.find(filter).sort({ updatedAt: -1 }).limit(limit + 1));
  const page = items.slice(0, limit);
  res.json({
    notifications: page.map(serializeNotification),
    unread: await unreadCount(req.user._id),
    nextCursor: items.length > limit ? page.at(-1).updatedAt.toISOString() : null,
  });
});

router.get('/unread', async (req, res) => {
  res.json({ unread: await unreadCount(req.user._id) });
});

/** Marks the given notifications as read, or all of them when no ids are sent. */
router.post('/read', validate(readSchema), async (req, res) => {
  const filter = { recipient: req.user._id, readAt: null, ...(req.body.ids && { _id: { $in: req.body.ids } }) };
  // Keep updatedAt as it is so the list order doesn't change when something is read.
  await Notification.updateMany(filter, { $set: { readAt: new Date() } }, { timestamps: false });
  res.json({ unread: await unreadCount(req.user._id) });
});

export default router;
