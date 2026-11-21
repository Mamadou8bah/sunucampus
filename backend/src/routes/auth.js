import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, changePasswordSchema, requestCodeSchema, confirmCodeSchema } from '../validators/auth.js';
import * as verification from '../controllers/verificationController.js';
import { env } from '../config/env.js';

const router = Router();

// Slows down password guessing; disabled in tests.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: { message: 'Too many attempts, please try again later' } },
});

router.post('/register', credentialLimiter, validate(registerSchema), auth.register);
router.post('/login', credentialLimiter, validate(loginSchema), auth.login);
router.get('/me', authenticate, auth.me);
router.patch('/password', authenticate, validate(changePasswordSchema), auth.changePassword);

// UTG email verification (blue tick).
const codeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 6,
  keyGenerator: (req) => req.user.id,
  skip: () => env.isTest,
  message: { error: { message: 'You have asked for a lot of codes. Try again in an hour.' } },
});
router.post('/verify-email/request', authenticate, codeLimiter, validate(requestCodeSchema), verification.requestCode);
router.post('/verify-email/confirm', authenticate, validate(confirmCodeSchema), verification.confirmCode);

export default router;
