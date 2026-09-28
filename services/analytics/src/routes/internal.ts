import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiError, requireInternalKey } from '@synerry/shared';
import { db } from '../db/client';
import { clicks } from '../db/schema';
import { hashIp, parseUserAgent } from '../clicks/parse';
import { countryFromIp } from '../clicks/geo';
import { getClickCounts, getLinkStats } from '../stats';
import { config } from '../config';

const clickSchema = z.object({
  linkId: z.number().int().positive(),
  clickedAt: z.iso.datetime({ offset: true }).optional(),
  ip: z.string().max(64).optional(),
  userAgent: z.string().max(1000).optional(),
  referer: z.string().max(2000).optional(),
});

const summarySchema = z.object({
  linkIds: z.array(z.number().int().positive()).max(1000),
});

const linkIdParam = z.coerce.number().int().positive();
const daysQuery = z.coerce.number().int().min(1).max(365).default(30);

export function internalRoutes() {
  const r = new Hono();
  r.use(
    '*',
    requireInternalKey(() => config.internalApiKey),
  );

  r.post('/clicks', async (c) => {
    const parsed = clickSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(apiError('validation_error', 'Invalid click event'), 400);
    const { linkId, clickedAt, ip, userAgent, referer } = parsed.data;
    const agent = parseUserAgent(userAgent);
    const country = await countryFromIp(ip);
    const [row] = await db
      .insert(clicks)
      .values({
        linkId,
        clickedAt: clickedAt ? new Date(clickedAt) : undefined,
        ipHash: hashIp(ip),
        userAgent,
        referer: referer || null,
        country,
        ...agent,
      })
      .returning({ id: clicks.id });
    return c.json({ id: row.id }, 201);
  });

  r.get('/stats/:linkId', async (c) => {
    const linkId = linkIdParam.safeParse(c.req.param('linkId'));
    const days = daysQuery.safeParse(c.req.query('days'));
    if (!linkId.success || !days.success) return c.json(apiError('validation_error', 'Invalid link id or days'), 400);
    return c.json(await getLinkStats(linkId.data, days.data));
  });

  r.post('/stats/summary', async (c) => {
    const parsed = summarySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(apiError('validation_error', 'linkIds must be an array of up to 1000 ids'), 400);
    const counts = await getClickCounts(parsed.data.linkIds);
    const totalClicks = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return c.json({ counts, totalClicks });
  });

  r.delete('/clicks/:linkId', async (c) => {
    const linkId = linkIdParam.safeParse(c.req.param('linkId'));
    if (!linkId.success) return c.json(apiError('validation_error', 'Invalid link id'), 400);
    const deleted = await db.delete(clicks).where(eq(clicks.linkId, linkId.data)).returning({ id: clicks.id });
    return c.json({ deleted: deleted.length });
  });

  return r;
}
