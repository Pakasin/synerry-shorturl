import { Hono } from 'hono';
import { and, count, desc, eq, gte, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { apiError } from '@synerry/shared';
import { db } from '../db/client';
import { blockedDomains, links, users } from '../db/schema';
import { toLinkDto } from '../links/dto';
import { BUILT_IN_BLOCKED, getFeedStatus, normalizeDomain, refreshBlocklist, refreshFeedBlocklist } from '../links/blocklist';
import { notDeleted } from '../links/queries';
import { deleteUserSessions } from '../auth/session';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { loadClickCounts } from '../services/analytics';
import { invalid, notFound, readJson } from '../http';
import { containsPattern, idParamSchema, offsetOf, paginationSchema } from '../validation';
import type { AppEnv } from '../types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SUMMARY_CLICK_SAMPLE = 1000;

const linkFilterSchema = paginationSchema.extend({ filter: z.enum(['all', 'locked']).default('all') });

const lockSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });

const userStatusSchema = z.object({ isActive: z.boolean() });

const DOMAIN_PATTERN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

function hostOf(input: string): string {
  if (!/^https?:\/\//i.test(input)) return input;
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

const blockSchema = z.object({
  domain: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const domain = normalizeDomain(hostOf(value));
      if (!DOMAIN_PATTERN.test(domain)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a domain name, for example phishing-site.com' });
        return z.NEVER;
      }
      return domain;
    }),
  reason: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(300).optional()),
});

const adminUserColumns = {
  id: users.id,
  username: users.username,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

const activeLinkCount = sql<number>`(select count(*)::int from links l where l.user_id = "users"."id" and l.deleted_at is null)`;

export function adminRoutes() {
  const r = new Hono<AppEnv>();
  r.use('*', requireAuth, requireAdmin);

  r.get('/summary', async (c) => {
    const weekAgo = new Date(Date.now() - WEEK_MS);
    const [[u], [l], [locked], [recent], [blocked], ids] = await Promise.all([
      db
        .select({ total: count(), suspended: sql<number>`count(*) filter (where ${users.isActive} = false)::int` })
        .from(users),
      db.select({ total: count() }).from(links).where(notDeleted),
      db
        .select({ total: count() })
        .from(links)
        .where(and(notDeleted, isNotNull(links.lockedAt))),
      db
        .select({ total: count() })
        .from(links)
        .where(and(notDeleted, gte(links.createdAt, weekAgo))),
      db.select({ total: count() }).from(blockedDomains),
      db.select({ id: links.id }).from(links).where(notDeleted).limit(SUMMARY_CLICK_SAMPLE),
    ]);
    const clicks = await loadClickCounts(ids.map((x) => x.id));
    return c.json({
      users: u.total,
      suspendedUsers: u.suspended,
      links: l.total,
      lockedLinks: locked.total,
      linksLast7Days: recent.total,
      blockedDomains: blocked.total + BUILT_IN_BLOCKED.length,
      totalClicks: clicks.total,
    });
  });

  r.get('/users', async (c) => {
    const parsed = paginationSchema.safeParse(c.req.query());
    if (!parsed.success) return invalid(c, parsed.error, 'Invalid query');
    const { q, page, pageSize } = parsed.data;
    const where = q ? ilike(users.username, containsPattern(q)) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ ...adminUserColumns, linkCount: activeLinkCount })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(pageSize)
        .offset(offsetOf(parsed.data)),
      db.select({ total: count() }).from(users).where(where),
    ]);
    return c.json({ items: rows, total, page, pageSize });
  });

  r.patch('/users/:id', async (c) => {
    const id = idParamSchema.safeParse(c.req.param('id'));
    const body = userStatusSchema.safeParse(await readJson(c));
    if (!id.success || !body.success) return c.json(apiError('validation_error', 'Invalid input'), 400);
    if (id.data === c.get('user').id) {
      return c.json(apiError('cannot_change_self', 'You cannot change your own account status'), 400);
    }
    const [target] = await db.select().from(users).where(eq(users.id, id.data));
    if (!target) return notFound(c, 'User not found');
    if (target.role === 'admin') {
      return c.json(apiError('cannot_change_admin', 'Administrator accounts cannot be suspended here'), 400);
    }
    const [updated] = await db
      .update(users)
      .set({ isActive: body.data.isActive })
      .where(eq(users.id, target.id))
      .returning(adminUserColumns);
    if (!body.data.isActive) await deleteUserSessions(target.id);
    return c.json({ user: updated });
  });

  r.get('/links', async (c) => {
    const parsed = linkFilterSchema.safeParse(c.req.query());
    if (!parsed.success) return invalid(c, parsed.error, 'Invalid query');
    const { q, page, pageSize, filter } = parsed.data;
    const conditions: SQL[] = [notDeleted];
    if (filter === 'locked') conditions.push(isNotNull(links.lockedAt));
    if (q) {
      const pattern = containsPattern(q);
      conditions.push(
        or(ilike(links.originalUrl, pattern), ilike(links.shortCode, pattern), ilike(users.username, pattern))!,
      );
    }
    const where = and(...conditions);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ link: links, owner: users.username, ownerActive: users.isActive })
        .from(links)
        .innerJoin(users, eq(users.id, links.userId))
        .where(where)
        .orderBy(desc(links.createdAt), desc(links.id))
        .limit(pageSize)
        .offset(offsetOf(parsed.data)),
      db.select({ total: count() }).from(links).innerJoin(users, eq(users.id, links.userId)).where(where),
    ]);
    const clicks = await loadClickCounts(rows.map((row) => row.link.id));
    const items = rows.map((row) => ({
      ...toLinkDto(row.link),
      owner: row.owner,
      ownerActive: row.ownerActive,
      clicks: clicks.of(row.link.id),
    }));
    return c.json({ items, total, page, pageSize, analyticsAvailable: clicks.available });
  });

  r.post('/links/:id/lock', async (c) => {
    const id = idParamSchema.safeParse(c.req.param('id'));
    if (!id.success) return notFound(c, 'Link not found');
    const body = lockSchema.safeParse(await readJson(c));
    if (!body.success) return invalid(c, body.error);
    const [updated] = await db
      .update(links)
      .set({ lockedAt: new Date(), lockReason: body.data.reason, lockedBy: c.get('user').id })
      .where(and(eq(links.id, id.data), notDeleted))
      .returning();
    if (!updated) return notFound(c, 'Link not found');
    return c.json({ link: toLinkDto(updated) });
  });

  r.post('/links/:id/unlock', async (c) => {
    const id = idParamSchema.safeParse(c.req.param('id'));
    if (!id.success) return notFound(c, 'Link not found');
    const [updated] = await db
      .update(links)
      .set({ lockedAt: null, lockReason: null, lockedBy: null })
      .where(and(eq(links.id, id.data), notDeleted))
      .returning();
    if (!updated) return notFound(c, 'Link not found');
    return c.json({ link: toLinkDto(updated) });
  });

  r.get('/blocklist', async (c) => {
    const rows = await db
      .select({
        id: blockedDomains.id,
        domain: blockedDomains.domain,
        reason: blockedDomains.reason,
        createdAt: blockedDomains.createdAt,
        createdBy: users.username,
      })
      .from(blockedDomains)
      .leftJoin(users, eq(users.id, blockedDomains.createdBy))
      .orderBy(desc(blockedDomains.createdAt));
    return c.json({ builtIn: BUILT_IN_BLOCKED, items: rows, feed: getFeedStatus() });
  });

  r.post('/blocklist/refresh-feeds', async (c) => {
    await refreshFeedBlocklist();
    return c.json({ feed: getFeedStatus() });
  });

  r.post('/blocklist', async (c) => {
    const parsed = blockSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error);
    const alreadyBlocked = () => c.json(apiError('already_blocked', 'This domain is already blocked'), 409);
    if (BUILT_IN_BLOCKED.includes(parsed.data.domain)) return alreadyBlocked();
    const [row] = await db
      .insert(blockedDomains)
      .values({ domain: parsed.data.domain, reason: parsed.data.reason, createdBy: c.get('user').id })
      .onConflictDoNothing({ target: blockedDomains.domain })
      .returning();
    if (!row) return alreadyBlocked();
    await refreshBlocklist();
    return c.json({ item: row }, 201);
  });

  r.delete('/blocklist/:id', async (c) => {
    const id = idParamSchema.safeParse(c.req.param('id'));
    if (!id.success) return notFound(c);
    const deleted = await db
      .delete(blockedDomains)
      .where(eq(blockedDomains.id, id.data))
      .returning({ id: blockedDomains.id });
    if (!deleted.length) return notFound(c);
    await refreshBlocklist();
    return c.body(null, 204);
  });

  return r;
}
