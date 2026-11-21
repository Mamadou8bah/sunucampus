import { z } from 'zod';
import { REPORT_TARGETS, REPORT_REASONS, REPORT_ACTIONS, REPORT_STATUS } from '../models/Report.js';
import { CONTENT_STATUS } from '../models/Post.js';
import { COMMUNITY_STATUS } from '../models/Community.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const page = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const reason = z.string().trim().max(500).optional();

export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: objectId,
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

export const reportsQuery = z.object({
  status: z.enum(Object.values(REPORT_STATUS)).optional(),
  targetType: z.enum(REPORT_TARGETS).optional(),
  ...page,
});

export const resolveReportSchema = z
  .object({
    status: z.enum([REPORT_STATUS.RESOLVED, REPORT_STATUS.DISMISSED]),
    action: z.enum(REPORT_ACTIONS).default('none'),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.status === REPORT_STATUS.RESOLVED || v.action === 'none', {
    message: 'A dismissed report cannot take an action',
    path: ['action'],
  });

export const adminPostsQuery = z.object({
  status: z.enum(Object.values(CONTENT_STATUS)).optional(),
  reported: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
  ...page,
});

export const contentStatusSchema = z.object({ status: z.enum(Object.values(CONTENT_STATUS)), reason });

export const adminCommunitiesQuery = z.object({
  status: z.enum(Object.values(COMMUNITY_STATUS)).optional(),
  q: z.string().trim().max(100).optional(),
  ...page,
});

export const communityStatusSchema = z.object({ status: z.enum(Object.values(COMMUNITY_STATUS)), reason });
