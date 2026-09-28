import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { links } from '../db/schema';
import { linkStatus, toLinkDto } from '../links/dto';
import { notDeleted } from '../links/queries';
import { requireAuth } from '../middleware/requireAuth';
import { loadClickCounts } from '../services/analytics';
import type { AppEnv } from '../types';

const TOP_LINKS = 5;

export function statsRoutes() {
  const r = new Hono<AppEnv>();
  r.use('*', requireAuth);

  r.get('/summary', async (c) => {
    const rows = await db
      .select()
      .from(links)
      .where(and(eq(links.userId, c.get('user').id), notDeleted));
    const clicks = await loadClickCounts(rows.map((l) => l.id));
    const topLinks = rows
      .map((l) => ({ ...toLinkDto(l), clicks: clicks.of(l.id) ?? 0 }))
      .filter((l) => l.clicks > 0)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, TOP_LINKS);
    return c.json({
      totalLinks: rows.length,
      activeLinks: rows.filter((l) => linkStatus(l) === 'active').length,
      totalClicks: clicks.total,
      topLinks,
      analyticsAvailable: clicks.available,
    });
  });

  return r;
}
