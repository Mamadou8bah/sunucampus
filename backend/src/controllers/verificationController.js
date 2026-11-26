import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { mailConfigured, sendMail } from '../services/mail.js';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const hashCode = (code) => createHash('sha256').update(`${env.jwtSecret}:${code}`).digest('hex');
const domainOf = (email) => email.split('@')[1];
const maskEmail = (email) => email.replace(/^(.{2})[^@]*(@.*)$/, (_m, a, b) => `${a}•••${b}`);

/**
 * Sends a 6-digit code to a UTG address. The student may verify their sign-up email or
 * a different UTG address; on confirmation that address becomes their account email.
 */
export async function requestCode(req, res) {
  if (env.isProduction && !mailConfigured()) {
    throw new ApiError(503, 'Email verification is temporarily unavailable. Try again later.');
  }
  const email = (req.body.email ?? req.user.email).toLowerCase();
  if (!env.verifiedEmailDomains.includes(domainOf(email))) {
    throw ApiError.badRequest(`Use your university email address (${env.verifiedEmailDomains.map((d) => `@${d}`).join(' or ')})`);
  }
  if (req.user.isVerified && email === req.user.email) throw ApiError.badRequest('This email is already verified');
  if (email !== req.user.email && (await User.exists({ email, _id: { $ne: req.user._id } }))) {
    throw ApiError.conflict('Another account already uses that email');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await User.updateOne(
    { _id: req.user._id },
    {
      emailVerification: {
        email,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
        attempts: 0,
      },
    },
  );

  await sendMail({
    to: email,
    subject: `${code} is your SunuCampus verification code`,
    text: `Hi ${req.user.name.split(' ')[0]},\n\nYour SunuCampus verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
  });

  res.json({
    sentTo: maskEmail(email),
    expiresInMinutes: CODE_TTL_MINUTES,
    // Lets the app be demonstrated without an email server. Never sent in production.
    ...(!mailConfigured() && !env.isProduction && { devCode: code }),
  });
}

export async function confirmCode(req, res) {
  const user = await User.findById(req.user._id).select('+emailVerification');
  const pending = user.emailVerification;
  if (!pending?.codeHash) throw ApiError.badRequest('Ask for a new code first');
  if (pending.expiresAt < new Date()) throw ApiError.badRequest('That code has expired. Ask for a new one.');
  if (pending.attempts >= MAX_ATTEMPTS) throw ApiError.badRequest('Too many wrong codes. Ask for a new one.');

  const expected = Buffer.from(pending.codeHash, 'hex');
  const given = Buffer.from(hashCode(req.body.code), 'hex');
  if (!timingSafeEqual(expected, given)) {
    await User.updateOne({ _id: user._id }, { $inc: { 'emailVerification.attempts': 1 } });
    const left = MAX_ATTEMPTS - pending.attempts - 1;
    throw ApiError.badRequest(left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.');
  }

  if (pending.email !== user.email) {
    if (await User.exists({ email: pending.email, _id: { $ne: user._id } })) throw ApiError.conflict('Another account already uses that email');
    user.email = pending.email;
  }
  user.emailVerifiedAt = new Date();
  user.emailVerification = undefined;
  await user.save();
  res.json({ user: user.toJSON() });
}
