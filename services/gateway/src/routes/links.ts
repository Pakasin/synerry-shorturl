import { Hono } from 'hono';
import { and, arrayContains, count, desc, eq, ilike, inArray, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { apiError } from '@synerry/shared';
import { db } from '../db/client';
import { links } from '../db/schema';
import { toLinkDto } from '../links/dto';
import { buildCsv, buildXlsx, exportFilename, loadExportRows } from '../links/export';
import { findOwnLink, notDeleted, TRASH_RETENTION_DAYS } from '../links/queries';
import { generateShortCode, MAX_CODE_ATTEMPTS } from '../links/shortCode';
import {
  createLinkSchema,
  listQuerySchema,
  originalUrlSchema,
  statsDaysSchema,
  updateLinkSchema,
} from '../links/validation';
import { requireAuth } from '../middleware/requireAuth';
import { rateLimit } from '../middleware/rateLimit';
import { deleteLinkClicks, getLinkStats, loadClickCounts } from '../services/analytics';
import { download, fieldError, invalid, notFound, readJson } from '../http';
import { containsPattern, offsetOf } from '../validation';
import type { AppEnv } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function linkRoutes() {
  const r = new Hono<AppEnv>();
  r.use('*', requireAuth);

  r.post('/', rateLimit({ max: 30, windowMs: 60 * 1000 }), async (c) => {
    const parsed = createLinkSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error);
    const { url, alias, title, expiresAt, startsAt, tags } = parsed.data;

    const attempts = alias ? 1 : MAX_CODE_ATTEMPTS;
    for (let i = 0; i < attempts; i++) {
      const [link] = await db
        .insert(links)
        .values({
          userId: c.get('user').id,
          originalUrl: url,
          shortCode: alias ?? generateShortCode(),
          title,
          expiresAt,
          startsAt,
          tags,
        })
        .onConflictDoNothing({ target: links.shortCode })
        .returning();
      if (link) return c.json({ link: toLinkDto(link) }, 201);
    }
    if (alias) {
      return c.json(
        apiError('alias_taken', 'This alias is already in use', [
          { field: 'alias', message: 'This alias is already in use' },
        ]),
        409,
      );
    }
    throw new Error('Could not generate a unique short code');
  });

  r.get('/', async (c) => {
    const parsed = listQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return invalid(c, parsed.error, 'Invalid query');
    const { q, tag, page, pageSize } = parsed.data;

    const conditions: SQL[] = [eq(links.userId, c.get('user').id), notDeleted];
    if (q) {
      const pattern = containsPattern(q);
      conditions.push(
        or(ilike(links.originalUrl, pattern), ilike(links.title, pattern), ilike(links.shortCode, pattern))!,
      );
    }
    if (tag) conditions.push(arrayContains(links.tags, [tag]));
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(links)
        .where(where)
        .orderBy(desc(links.createdAt), desc(links.id))
        .limit(pageSize)
        .offset(offsetOf(parsed.data)),
      db.select({ total: count() }).from(links).where(where),
    ]);
    const clicks = await loadClickCounts(rows.map((l) => l.id));
    const items = rows.map((l) => ({ ...toLinkDto(l), clicks: clicks.of(l.id) }));
    return c.json({ items, total, page, pageSize, analyticsAvailable: clicks.available });
  });

  r.get('/tags', async (c) => {
    const tags = await db
      .select({ name: sql<string>`unnest(${links.tags})`.as('name'), count: sql<number>`count(*)::int`.as('count') })
      .from(links)
      .where(and(eq(links.userId, c.get('user').id), notDeleted))
      .groupBy(sql`name`)
      .orderBy(sql`count desc, name`);
    return c.json({ tags });
  });

  r.get('/duplicates', async (c) => {
    const parsed = originalUrlSchema.safeParse(c.req.query('url') ?? '');
    if (!parsed.success) return c.json({ items: [] });
    const candidates = [...new Set([parsed.data, parsed.data.replace(/\/$/, '')])];
    const rows = await db
      .select()
      .from(links)
      .where(and(eq(links.userId, c.get('user').id), notDeleted, inArray(links.originalUrl, candidates)))
      .orderBy(desc(links.createdAt))
      .limit(5);
    return c.json({ items: rows.map(toLinkDto) });
  });

  r.get('/trash', async (c) => {
    const userId = c.get('user').id;
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS);
    const purged = await db
      .delete(links)
      .where(and(eq(links.userId, userId), lt(links.deletedAt, cutoff)))
      .returning({ id: links.id });
    await Promise.all(purged.map((l) => deleteLinkClicks(l.id)));

    const rows = await db
      .select()
      .from(links)
      .where(and(eq(links.userId, userId), isNotNull(links.deletedAt)))
      .orderBy(desc(links.deletedAt));
    return c.json({ items: rows.map(toLinkDto), retentionDays: TRASH_RETENTION_DAYS });
  });

  r.get('/export.csv', async (c) => {
    const rows = await loadExportRows(c.get('user').id);
    return download(c, buildCsv(rows), 'text/csv; charset=utf-8', exportFilename('csv'));
  });

  r.get('/export.xlsx', async (c) => {
    const rows = await loadExportRows(c.get('user').id);
    return download(
      c,
      await buildXlsx(rows),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      exportFilename('xlsx'),
    );
  });

  r.get('/:id', async (c) => {
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    if (!link) return notFound(c, 'Link not found');
    return c.json({ link: toLinkDto(link) });
  });

  r.get('/:id/stats', async (c) => {
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    if (!link) return notFound(c, 'Link not found');
    const days = statsDaysSchema.safeParse(c.req.query('days'));
    if (!days.success) return c.json(apiError('validation_error', 'days must be 7, 30 or 90'), 400);
    const stats = await getLinkStats(link.id, days.data);
    if (!stats) return c.json(apiError('analytics_unavailable', 'Statistics are temporarily unavailable'), 503);
    return c.json({ link: toLinkDto(link), stats });
  });

  r.patch('/:id', async (c) => {
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    if (!link) return notFound(c, 'Link not found');
    const parsed = updateLinkSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error);
    const changes = parsed.data;

    if (link.lockedAt && changes.isActive !== undefined) {
      return c.json(apiError('link_locked', 'This link was suspended by an administrator'), 403);
    }
    const startsAt = changes.startsAt !== undefined ? changes.startsAt : link.startsAt;
    const expiresAt = changes.expiresAt !== undefined ? changes.expiresAt : link.expiresAt;
    if (startsAt && expiresAt && startsAt >= expiresAt) {
      return fieldError(c, 'startsAt', 'Start date must be before the expiry date');
    }

    const [updated] = await db.update(links).set(changes).where(eq(links.id, link.id)).returning();
    return c.json({ link: toLinkDto(updated) });
  });

  r.delete('/:id', async (c) => {
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    if (!link) return notFound(c, 'Link not found');
    await db.update(links).set({ deletedAt: new Date() }).where(eq(links.id, link.id));
    return c.body(null, 204);
  });

  r.post('/:id/restore', async (c) => {
    const link = await findOwnLink(c.req.param('id'), c.get('user').id, 'trash');
    if (!link) return notFound(c, 'Link not found in trash');
    const [restored] = await db.update(links).set({ deletedAt: null }).where(eq(links.id, link.id)).returning();
    return c.json({ link: toLinkDto(restored) });
  });

  r.delete('/:id/permanent', async (c) => {
    const link = await findOwnLink(c.req.param('id'), c.get('user').id, 'any');
    if (!link) return notFound(c, 'Link not found');
    await db.delete(links).where(eq(links.id, link.id));
    await deleteLinkClicks(link.id);
    return c.body(null, 204);
  });

  return r;
}
