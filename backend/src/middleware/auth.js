import { User } from '../models/User.js';
import { ACCOUNT_STATUS } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/token.js';

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Verifies the bearer token and loads the current user from the database.
 * The role and status are read from the database (not the token), so role
 * changes and suspensions take effect immediately.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('Account no longer exists');
    if (user.changedPasswordAfter(payload.iat)) {
      throw ApiError.unauthorized('Password was changed, please log in again');
    }
    if (user.status !== ACCOUNT_STATUS.ACTIVE) {
      throw ApiError.forbidden(`Your account is ${user.status}`);
    }

    // Throttled write so "active users" statistics stay cheap to maintain.
    const now = Date.now();
    if (!user.lastActiveAt || now - user.lastActiveAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
      user.lastActiveAt = new Date(now);
      await User.updateOne({ _id: user._id }, { lastActiveAt: user.lastActiveAt });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Allows the request only if the authenticated user has one of the given roles. */
export const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!allowedRoles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};
