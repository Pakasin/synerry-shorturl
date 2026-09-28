import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { db, sql } from '../db/client';
import { clicks } from '../db/schema';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SLACK_BOT = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';

let app: ReturnType<typeof createApp>;
const KEY = { 'x-internal-key': 'test-internal-key', 'content-type': 'application/json' };

function call(method: string, path: string, body?: unknown) {
  return app.request(path, { method, headers: KEY, body: body === undefined ? undefined : JSON.stringify(body) });
}
const json = (res: Response): Promise<any> => res.json();
const click = (body: Record<string, unknown>) => call('POST', '/internal/clicks', body);

const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

beforeEach(async () => {
  await sql`truncate clicks restart identity`;
  app = createApp();
});

afterAll(async () => {
  await sql.end();
});

describe('internal key', () => {
  it('rejects every internal route without the right key', async () => {
    const noKey = await app.request('/internal/stats/1');
    const wrong = await app.request('/internal/stats/1', { headers: { 'x-internal-key': 'nope' } });
    expect(noKey.status).toBe(401);
    expect(wrong.status).toBe(401);
  });
});

describe('POST /internal/clicks', () => {
  it('stores device, browser and OS, and a salted hash instead of the IP', async () => {
    const res = await click({ linkId: 1, ip: '203.0.113.7', userAgent: IPHONE });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(clicks);
    expect(row.deviceType).toBe('mobile');
    expect(row.browser).toMatch(/Safari/);
    expect(row.os).toBe('iOS');
    expect(JSON.stringify(row)).not.toContain('203.0.113.7');
    expect(row.ipHash).toHaveLength(64);
  });

  it('rejects an invalid event with 400', async () => {
    expect((await click({ linkId: 'abc' })).status).toBe(400);
  });
});

describe('GET /internal/stats/:linkId', () => {
  it('counts clicks and unique visitors, excludes bots but reports them separately', async () => {
    await click({ linkId: 1, ip: '1.1.1.1', userAgent: IPHONE, referer: 'https://www.google.com/search?q=synerry' });
    await click({ linkId: 1, ip: '1.1.1.1', userAgent: IPHONE, referer: 'https://www.google.com/' });
    await click({ linkId: 1, ip: '2.2.2.2', userAgent: WINDOWS_CHROME });
    await click({ linkId: 1, ip: '3.3.3.3', userAgent: SLACK_BOT });
    await click({ linkId: 2, ip: '4.4.4.4', userAgent: IPHONE });

    const stats = await json(await call('GET', '/internal/stats/1?days=7'));
    expect(stats.totalClicks).toBe(3);
    expect(stats.uniqueVisitors).toBe(2);
    expect(stats.botClicks).toBe(1);
    expect(stats.referers).toEqual([
      { name: 'www.google.com', count: 2 },
      { name: 'Direct', count: 1 },
    ]);
    expect(stats.devices).toEqual([
      { name: 'mobile', count: 2 },
      { name: 'desktop', count: 1 },
    ]);
    expect(stats.recent).toHaveLength(3);
    expect(JSON.stringify(stats.recent)).not.toContain('ipHash');
  });

  it('returns one entry per day with zeros filled in, split by Thai time', async () => {
    const today = bangkokToday();
    await click({ linkId: 1, clickedAt: `${today}T00:30:00+07:00`, userAgent: IPHONE });
    const stats = await json(await call('GET', '/internal/stats/1?days=7'));
    expect(stats.daily).toHaveLength(7);
    expect(stats.daily.at(-1)).toEqual({ date: today, clicks: 1 });
    expect(stats.daily.at(-2).clicks).toBe(0);
  });

  it('returns zeros for a link with no clicks', async () => {
    const stats = await json(await call('GET', '/internal/stats/99'));
    expect(stats.totalClicks).toBe(0);
    expect(stats.daily).toHaveLength(30);
  });
});

describe('POST /internal/stats/summary', () => {
  it('returns a count for every requested link, 0 when none', async () => {
    await click({ linkId: 1, userAgent: IPHONE });
    await click({ linkId: 1, userAgent: IPHONE });
    await click({ linkId: 2, userAgent: IPHONE });
    const res = await json(await call('POST', '/internal/stats/summary', { linkIds: [1, 2, 3] }));
    expect(res.counts).toEqual({ '1': 2, '2': 1, '3': 0 });
    expect(res.totalClicks).toBe(3);
  });

  it('rejects a bad body with 400', async () => {
    expect((await call('POST', '/internal/stats/summary', { linkIds: 'x' })).status).toBe(400);
  });
});

describe('DELETE /internal/clicks/:linkId', () => {
  it('deletes only the clicks of that link', async () => {
    await click({ linkId: 1 });
    await click({ linkId: 1 });
    await click({ linkId: 2 });
    const res = await json(await call('DELETE', '/internal/clicks/1'));
    expect(res.deleted).toBe(2);
    const left = await db.select().from(clicks);
    expect(left.map((r) => r.linkId)).toEqual([2]);
  });
});

describe('country from IP', () => {
  it('stores the country for a public IP, and none for private or local IPs', async () => {
    await click({ linkId: 1, ip: '1.46.0.1', userAgent: IPHONE });
    await click({ linkId: 1, ip: '8.8.8.8', userAgent: IPHONE });
    await click({ linkId: 1, ip: '127.0.0.1', userAgent: IPHONE });
    await click({ linkId: 1, ip: '192.168.1.10', userAgent: IPHONE });
    await click({ linkId: 1, ip: '::ffff:1.46.0.1', userAgent: IPHONE });
    const rows = await db.select().from(clicks).orderBy(clicks.id);
    expect(rows.map((r) => r.country)).toEqual(['TH', 'US', null, null, 'TH']);
  });

  it('returns a country breakdown in the stats, with unknowns grouped', async () => {
    await click({ linkId: 1, ip: '1.46.0.1', userAgent: IPHONE });
    await click({ linkId: 1, ip: '1.46.0.2', userAgent: IPHONE });
    await click({ linkId: 1, ip: '8.8.8.8', userAgent: IPHONE });
    await click({ linkId: 1, ip: '10.0.0.1', userAgent: IPHONE });
    const stats = await json(await call('GET', '/internal/stats/1?days=7'));
    expect(stats.countries).toEqual([
      { name: 'TH', count: 2 },
      { name: 'US', count: 1 },
      { name: 'Unknown', count: 1 },
    ]);
  });
});
