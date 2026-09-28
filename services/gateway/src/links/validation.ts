import { z } from 'zod';
import { paginationSchema } from '../validation';
import { config } from '../config';
import { isBlockedHost } from './blocklist';

export const RESERVED_ALIASES = new Set([
  'api',
  'internal',
  'health',
  'admin',
  'login',
  'logout',
  'register',
  'trash',
  'dashboard',
  'history',
  'links',
  'settings',
  'static',
  'assets',
  'favicon.ico',
  'robots.txt',
]);

export const originalUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(2048, 'URL is too long (max 2048 characters)')
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Please enter a valid URL, for example https://www.synerry.com' });
      return z.NEVER;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Only http and https URLs are allowed' });
      return z.NEVER;
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: 'custom', message: 'URLs containing a username or password are not allowed' });
      return z.NEVER;
    }
    if (url.host === new URL(config.shortBaseUrl).host) {
      ctx.addIssue({ code: 'custom', message: 'This URL is already a short link' });
      return z.NEVER;
    }
    if (isBlockedHost(url.hostname)) {
      ctx.addIssue({
        code: 'custom',
        message: 'This domain is not allowed (link shorteners and known unsafe sites are blocked)',
      });
      return z.NEVER;
    }
    return url.href;
  });

const aliasSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,30}$/, 'Alias must be 3-30 characters: letters, numbers, - or _')
  .refine((v) => !RESERVED_ALIASES.has(v.toLowerCase()), 'This alias is reserved');

const dateSchema = z.iso.datetime({ offset: true, message: 'Must be an ISO date-time' }).transform((v) => new Date(v));

const expiresAtSchema = dateSchema.refine((d) => d.getTime() > Date.now(), 'Expiry must be in the future');

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(30, 'Each tag must be at most 30 characters')
  .regex(/^[\p{L}\p{M}\p{N} _-]+$/u, 'Tags may contain letters, numbers, spaces, - and _');

const tagsSchema = z
  .array(tagSchema)
  .max(10, 'At most 10 tags')
  .transform((tags) => {
    const seen = new Set<string>();
    return tags.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  });

const titleSchema = z.string().trim().max(200, 'Title must be at most 200 characters');

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const blankToNull = (v: unknown) => (v === '' ? null : v);

export const createLinkSchema = z
  .object({
    url: originalUrlSchema,
    alias: z.preprocess(blankToUndefined, aliasSchema.optional()),
    title: z.preprocess(blankToUndefined, titleSchema.optional()),
    expiresAt: z.preprocess(blankToUndefined, expiresAtSchema.optional()),
    startsAt: z.preprocess(blankToUndefined, dateSchema.optional()),
    tags: tagsSchema.optional(),
  })
  .refine((v) => !v.startsAt || !v.expiresAt || v.startsAt < v.expiresAt, {
    message: 'Start date must be before the expiry date',
    path: ['startsAt'],
  });

export const updateLinkSchema = z
  .object({
    title: z.preprocess(blankToNull, titleSchema.nullable()).optional(),
    isActive: z.boolean().optional(),
    expiresAt: z.preprocess(blankToNull, expiresAtSchema.nullable()).optional(),
    startsAt: z.preprocess(blankToNull, dateSchema.nullable()).optional(),
    tags: tagsSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listQuerySchema = paginationSchema.extend({
  tag: z.string().trim().max(30).optional(),
});

export const statsDaysSchema = z.coerce
  .number()
  .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
  .default(30);
