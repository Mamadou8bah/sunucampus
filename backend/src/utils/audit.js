import { AuditLog } from '../models/AuditLog.js';

export const recordAudit = (actor, action, targetType, targetId, details) =>
  AuditLog.create({ actor: actor.id, action, targetType, targetId, details });
