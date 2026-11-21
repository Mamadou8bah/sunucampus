import { warnUser } from './adminModerationController.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { ROLES, ACCOUNT_STATUS } from '../config/roles.js';
import { ApiError } from '../utils/ApiError.js';
import { recordAudit } from '../utils/audit.js';
import { disconnectUser } from '../realtime/socket.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pageInfo = (page, limit, total) => ({ page, limit, total, totalPages: Math.ceil(total / limit) || 1 });

export async function listUsers(req, res) {
  const { q, role, status, page, limit } = req.validated.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { programme: pattern }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({ users, ...pageInfo(page, limit, total) });
}

export async function getUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ user });
}

/** Stops an admin from locking themselves out or removing the last active admin. */
async function guardAdminChange(actor, target) {
  if (actor.id === target.id) throw ApiError.badRequest('You cannot remove your own administrator access');
  if (target.role === ROLES.ADMIN && target.status === ACCOUNT_STATUS.ACTIVE) {
    const activeAdmins = await User.countDocuments({ role: ROLES.ADMIN, status: ACCOUNT_STATUS.ACTIVE });
    if (activeAdmins <= 1) throw ApiError.badRequest('The platform must keep at least one active administrator');
  }
}

export async function updateRole(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const { role } = req.body;
  if (user.role === role) return res.json({ user });
  if (user.role === ROLES.ADMIN) await guardAdminChange(req.user, user);

  const previous = user.role;
  user.role = role;
  await user.save();
  await recordAudit(req.user, 'user.role_changed', 'User', user._id, { from: previous, to: role });
  res.json({ user });
}

export async function updateStatus(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const { status, reason } = req.body;
  if (user.status === status) return res.json({ user });
  if (user.role === ROLES.ADMIN && status !== ACCOUNT_STATUS.ACTIVE) await guardAdminChange(req.user, user);

  const previous = user.status;
  user.status = status;
  user.statusReason = status === ACCOUNT_STATUS.ACTIVE ? undefined : reason;
  await user.save();
  await recordAudit(req.user, 'user.status_changed', 'User', user._id, { from: previous, to: status, reason });
  // End live messaging sessions straight away; REST requests are already blocked by authenticate.
  if (status !== ACCOUNT_STATUS.ACTIVE) disconnectUser(user._id);
  res.json({ user });
}

export async function listAuditLogs(req, res) {
  const { page, limit } = req.validated.query;
  const [logs, total] = await Promise.all([
    AuditLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'name email role'),
    AuditLog.estimatedDocumentCount(),
  ]);
  res.json({ logs, ...pageInfo(page, limit, total) });
}

/** Sends a formal warning to a student (docs/PROPOSAL.md §4.3, Post Moderation). */
export async function warn(req, res) {
  const { message, targetType, targetId } = req.body;
  const user = await warnUser(req.user, req.params.id, message, { targetType, targetId });
  res.status(201).json({ user: { id: user.id, warningCount: user.warningCount, lastWarnedAt: user.lastWarnedAt } });
}
