import { Router } from 'express';
import { z } from 'zod';
import * as users from '../controllers/adminUserController.js';
import * as moderation from '../controllers/adminModerationController.js';
import * as stats from '../controllers/adminStatsController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/roles.js';
import { SECTIONS } from '../services/stats.js';
import { listUsersQuery, updateRoleSchema, updateStatusSchema, auditLogQuery, warnSchema } from '../validators/admin.js';
import {
  reportsQuery,
  resolveReportSchema,
  adminPostsQuery,
  contentStatusSchema,
  adminCommunitiesQuery,
  communityStatusSchema,
} from '../validators/moderation.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const statsQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    interval: z.enum(['day', 'week', 'month']).optional(),
    section: z.enum(['all', ...Object.keys(SECTIONS)]).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"From" must be before "to"', path: ['from'] })
  .refine((q) => !q.from || !q.to || (new Date(q.to) - new Date(q.from)) / 86_400_000 <= 731, {
    message: 'Choose a range of two years or less',
    path: ['from'],
  });

const router = Router();

// Every admin route requires an authenticated administrator.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/overview', moderation.overview);

router.get('/users', validate(listUsersQuery, 'query'), users.listUsers);
router.get('/users/:id', users.getUser);
router.patch('/users/:id/role', validate(updateRoleSchema), users.updateRole);
router.patch('/users/:id/status', validate(updateStatusSchema), users.updateStatus);
router.post('/users/:id/warn', validate(warnSchema), users.warn);

router.get('/reports', validate(reportsQuery, 'query'), moderation.listReports);
router.patch('/reports/:id', validate(resolveReportSchema), moderation.resolveReport);

router.get('/posts', validate(adminPostsQuery, 'query'), moderation.listPosts);
router.patch('/posts/:id/status', validate(contentStatusSchema), moderation.updatePostStatus);
router.patch('/comments/:id/status', validate(contentStatusSchema), moderation.updateCommentStatus);

router.get('/communities', validate(adminCommunitiesQuery, 'query'), moderation.listCommunities);
router.patch('/communities/:id/status', validate(communityStatusSchema), moderation.updateCommunityStatus);

router.get('/audit-logs', validate(auditLogQuery, 'query'), users.listAuditLogs);

router.get('/stats', validate(statsQuery, 'query'), stats.report);
router.get('/stats/export', validate(statsQuery, 'query'), stats.exportCsv);

export default router;
