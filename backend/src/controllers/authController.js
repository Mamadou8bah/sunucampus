import { User } from '../models/User.js';
import { ACCOUNT_STATUS } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { signToken } from '../utils/token.js';

const authResponse = (user) => ({ token: signToken(user), user: user.toJSON() });

export async function register(req, res) {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('An account with that email already exists');

  // Role is never taken from the request: everyone registers as a student.
  const user = await User.create({ name, email, password, lastActiveAt: new Date() });
  res.status(201).json(authResponse(user));
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');

  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password');
  }
  if (user.status !== ACCOUNT_STATUS.ACTIVE) {
    const reason = user.statusReason ? `: ${user.statusReason}` : '';
    throw ApiError.forbidden(`Your account is ${user.status}${reason}`);
  }

  user.lastActiveAt = new Date();
  await user.save();
  res.json(authResponse(user));
}

export function me(req, res) {
  res.json({ user: req.user.toJSON() });
}

export async function changePassword(req, res) {
  const user = await User.findById(req.user.id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = req.body.newPassword;
  await user.save();
  // passwordChangedAt invalidates older tokens, so issue a fresh one.
  res.json(authResponse(user));
}
