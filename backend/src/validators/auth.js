import { z } from 'zod';
import { env } from '../config/env.js';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .refine(
    (value) => env.allowedEmailDomains.length === 0 || env.allowedEmailDomains.includes(value.split('@')[1]),
    { message: 'Use your university email address' },
  );

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email,
  password,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const requestCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
});

export const confirmCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});
