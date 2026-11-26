import { z } from 'zod';
import { CONNECTION_GOALS, PROFILE_PROMPTS } from '../config/roles.js';

const MAX_TAGS = 15;

/** Normalises free-text tags: trimmed, lower case, single spaces, no duplicates. */
const tagList = (label) =>
  z
    .array(z.string().max(30, `Each ${label} must be at most 30 characters`))
    .max(MAX_TAGS, `Add at most ${MAX_TAGS} ${label}s`)
    .transform((tags) => [
      ...new Set(tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)),
    ]);

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
    discoverable: z.boolean().optional(),
    rankingExcludedUsers: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(200).optional(),
    programme: optionalText(120),
    yearOfStudy: z.coerce.number().int().min(1).max(7).nullable().optional(),
    bio: optionalText(500),
    interests: tagList('interest').optional(),
    skills: tagList('skill').optional(),
    prompts: z
      .array(
        z.object({
          question: z.enum(PROFILE_PROMPTS),
          answer: z.string().trim().min(1, 'Write an answer').max(150, 'Answers can be at most 150 characters'),
        }),
      )
      .max(3, 'Choose up to three prompts')
      .refine((list) => new Set(list.map((p) => p.question)).size === list.length, 'Each prompt can only be used once')
      .optional(),
    goals: z.array(z.enum(CONNECTION_GOALS)).max(CONNECTION_GOALS.length).transform((g) => [...new Set(g)]).optional(),
    avatarUrl: z
      .string()
      .trim()
      .url('Enter a valid image URL')
      .refine((v) => /^https?:\/\//.test(v), 'Image URL must start with http or https')
      .or(z.literal('').transform(() => undefined))
      .optional(),
  })
  .strict();

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []));

export const discoverQuery = z.object({
  q: z.string().trim().max(100).optional(),
  programme: z.string().trim().max(120).optional(),
  year: z.coerce.number().int().min(1).max(7).optional(),
  interests: csv,
  skills: csv,
  goal: z.enum(CONNECTION_GOALS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const matchesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
