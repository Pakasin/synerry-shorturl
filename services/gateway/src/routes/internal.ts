import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { apiError, requireInternalKey } from '@synerry/shared';
import { db } from '../db/client';
import { links, users } from '../db/schema';
import { isBlockedUrl } from '../links/blocklist';
import { config } from '../config';

export function internalRoutes() {
  const r = new Hono();
  r.use(
    '*',
    requireInternalKey(() => config.internalApiKey),
  );

  r.get('/links/:code', async (c) => {
    const [row] = await db
      .select({
        id: links.id,
        originalUrl: links.originalUrl,
        linkActive: links.isActive,
        lockedAt: links.lockedAt,
        ownerActive: users.isActive,
        startsAt: links.startsAt,
        expiresAt: links.expiresAt,
      })
      .from(links)
      .innerJoin(users, eq(users.id, links.userId))
      .where(and(eq(links.shortCode, c.req.param('code')), isNull(links.deletedAt)));
    if (!row) return c.json(apiError('not_found', 'Link not found'), 404);
    return c.json({
      id: row.id,
      originalUrl: row.originalUrl,
      isActive: row.linkActive && !row.lockedAt && row.ownerActive,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      blocked: isBlockedUrl(row.originalUrl),
    });
  });

  return r;
}
