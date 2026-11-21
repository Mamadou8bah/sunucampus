import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as reports from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createReportSchema } from '../validators/moderation.js';
import { env } from '../config/env.js';

// Stops one account flooding the moderation queue.
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  skip: () => env.isTest,
  message: { error: { message: 'You have sent a lot of reports. Please try again later.' } },
});

const router = Router();
router.post('/', authenticate, reportLimiter, validate(createReportSchema), reports.create);

export default router;
