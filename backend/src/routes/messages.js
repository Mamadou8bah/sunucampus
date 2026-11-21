import { Router } from 'express';
import { z } from 'zod';
import * as conversations from '../controllers/messageController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const openSchema = z.object({ userId: objectId, listingId: objectId.optional() });
const sendSchema = z.object({
  content: z.string().trim().min(1, 'Write a message first').max(2000, 'Messages can be at most 2000 characters'),
});
const messagesQuery = z.object({
  before: objectId.optional(), // id of the oldest message already loaded
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const router = Router();
router.use(authenticate);
router.get('/', conversations.list);
router.get('/unread', conversations.unreadTotal);
router.post('/', validate(openSchema), conversations.open);
router.get('/:id/messages', validate(messagesQuery, 'query'), conversations.messages);
router.post('/:id/messages', validate(sendSchema), conversations.send);
router.post('/:id/read', conversations.markRead);

export default router;
