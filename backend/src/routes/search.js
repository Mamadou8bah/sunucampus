import { Router } from 'express';
import { z } from 'zod';
import { search } from '../controllers/searchController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const searchQuery = z.object({
  q: z.string().trim().min(1, 'Type something to search').max(100),
  type: z.enum(['all', 'people', 'communities', 'posts']).default('all'),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

const router = Router();
router.get('/', authenticate, validate(searchQuery, 'query'), search);

export default router;
