import { Router } from 'express';
import { z } from 'zod';
import * as listings from '../controllers/listingController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { imageUpload } from '../utils/images.js';
import { LISTING_CATEGORIES, LISTING_CONDITIONS, LISTING_STATUS } from '../models/Listing.js';

// Listing forms are multipart (they carry photos), so numbers arrive as strings.
const price = z.coerce.number({ message: 'Enter a price' }).int('Use whole dalasi').min(0).max(1_000_000);
const details = {
  title: z.string().trim().min(3, 'Give it a title of at least 3 characters').max(80),
  description: z.string().trim().max(1500).optional(),
  price,
  category: z.enum(LISTING_CATEGORIES, { message: 'Choose a category' }),
  condition: z.enum(LISTING_CONDITIONS).default('good'),
  location: z.string().trim().max(80).optional(),
};

const createSchema = z.object(details);
const updateSchema = z.object({
  ...Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.optional()])),
  status: z.enum([LISTING_STATUS.ACTIVE, LISTING_STATUS.SOLD]).optional(),
  // JSON list of existing photo URLs to keep (sent as a string in multipart forms).
  keepPhotos: z
    .union([z.array(z.string()), z.string()])
    .transform((v, ctx) => {
      if (typeof v !== 'string') return v;
      try {
        const parsed = JSON.parse(v || '[]');
        if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) return parsed;
      } catch {
        // fall through to the validation error below
      }
      ctx.addIssue({ code: 'custom', message: 'Invalid photo list' });
      return z.NEVER;
    })
    .optional(),
});
const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(LISTING_CATEGORIES).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  mine: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const photos = imageUpload({ field: 'photos', max: 4 });

const router = Router();
router.use(authenticate);
router.get('/', validate(listQuery, 'query'), listings.list);
router.post('/', photos, validate(createSchema), listings.create);
router.get('/:id', listings.get);
router.patch('/:id', photos, validate(updateSchema), listings.update);
router.delete('/:id', listings.remove);

export default router;
