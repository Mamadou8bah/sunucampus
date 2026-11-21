import { z } from 'zod';
import { ROLE_LIST, STATUS_LIST } from '../config/roles.js';

export const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLE_LIST).optional(),
  status: z.enum(STATUS_LIST).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateRoleSchema = z.object({ role: z.enum(ROLE_LIST) });

export const updateStatusSchema = z.object({
  status: z.enum(STATUS_LIST),
  reason: z.string().trim().max(500).optional(),
});

export const auditLogQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const warnSchema = z.object({
  message: z.string().trim().min(10, 'Write at least 10 characters').max(1000),
  targetType: z.enum(['post', 'comment', 'listing', 'community', 'user']).optional(),
  targetId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id').optional(),
});
