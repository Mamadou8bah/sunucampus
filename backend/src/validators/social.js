import { z } from 'zod';
import { CONNECTION_SOURCES } from '../models/Connection.js';
import { COMMUNITY_CATEGORIES } from '../models/Community.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const sendRequestSchema = z.object({
  recipientId: objectId,
  source: z.enum(CONNECTION_SOURCES).default('profile'),
});

export const respondSchema = z.object({ action: z.enum(['accept', 'reject']) });

const page = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

export const createPostSchema = z.object({
  content: z.string().trim().min(1, 'Write something first').max(2000, 'Posts can be at most 2000 characters'),
  community: objectId.optional(),
});

export const feedQuery = z.object({
  community: objectId.optional(),
  author: objectId.optional(),
  scope: z.enum(['foryou', 'campus']).optional(),
  ...page,
});

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Write a comment first').max(1000, 'Comments can be at most 1000 characters'),
});

export const pinSchema = z.object({ pinned: z.boolean() });

export const createCommunitySchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(60),
  category: z.enum(COMMUNITY_CATEGORIES),
  description: z.string().trim().max(1000).optional(),
});

export const updateCommunitySchema = z
  .object({
    description: z.string().trim().max(1000).optional(),
    category: z.enum(COMMUNITY_CATEGORIES).optional(),
  })
  .strict();

export const communitiesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(COMMUNITY_CATEGORIES).optional(),
  mine: z.enum(['true', 'false']).optional(),
  ...page,
});

export const moderatorSchema = z.object({ userId: objectId });
