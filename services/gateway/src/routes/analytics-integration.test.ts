import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { sql } from '../db/client';
import * as h from '../../test/helpers';
import { json, registerAndLogin } from '../../test/helpers';

let app: ReturnType<typeof createApp>;
let alice: string;
let bob: string;
let fetchMock: ReturnType<typeof vi.fn>;

const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
const create = async (cookie: string, url: string) =>
  (await json(await send('POST', '/api/links', { cookie, body: { url } }))).link;
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  await sql`truncate users, links, sessions restart identity cascade`;
  app = createApp();
  alice = await registerAndLogin(app, 'alice');
  bob = await registerAndLogin(app, 'bob');
  fetchMock = vi.fn(async () => {
    throw new TypeError('fetch failed');
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await sql.end();
});

describe('history with click counts', () => {
  it('asks analytics for my link ids only, with the internal key, and shows the counts', async () => {
    const a1 = await create(alice, 'https://a.example.com');
    const a2 = await create(alice, 'https://b.example.com');
    await create(bob, 'https://bob.example.com');
    fetchMock.mockImplementation(async () => reply({ counts: { [a1.id]: 5, [a2.id]: 0 }, totalClicks: 5 }));

    const list = await json(await send('GET', '/api/links', { cookie: alice }));
    expect(list.analyticsAvailable).toBe(true);
    expect(list.items.map((l: { clicks: number }) => l.clicks).sort()).toEqual([0, 5]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:9/internal/stats/summary');
    expect(init.headers['x-internal-key']).toBe('test-internal-key');
    expect(JSON.parse(init.body).linkIds.sort()).toEqual([a1.id, a2.id].sort());
  });

  it('still returns the history when analytics is down, with clicks = null', async () => {
    await create(alice, 'https://a.example.com');
    const res = await send('GET', '/api/links', { cookie: alice });
    expect(res.status).toBe(200);
    const list = await json(res);
    expect(list.analyticsAvailable).toBe(false);
    expect(list.items[0].clicks).toBeNull();
  });
});

describe('GET /api/links/:id/stats', () => {
  it('checks ownership before calling analytics', async () => {
    const link = await create(alice, 'https://a.example.com');
    const res = await send('GET', `/api/links/${link.id}/stats`, { cookie: bob });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns stats from analytics, or 503 when analytics is down', async () => {
    const link = await create(alice, 'https://a.example.com');
    expect((await send('GET', `/api/links/${link.id}/stats`, { cookie: alice })).status).toBe(503);
    fetchMock.mockImplementation(async () => reply({ totalClicks: 12, daily: [] }));
    const res = await send('GET', `/api/links/${link.id}/stats?days=7`, { cookie: alice });
    const body = await json(res);
    expect(body.stats.totalClicks).toBe(12);
    expect(body.link.id).toBe(link.id);
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe(`http://127.0.0.1:9/internal/stats/${link.id}?days=7`);
  });

  it('only allows 7, 30 or 90 days', async () => {
    const link = await create(alice, 'https://a.example.com');
    expect((await send('GET', `/api/links/${link.id}/stats?days=5`, { cookie: alice })).status).toBe(400);
  });
});

describe('permanently deleting a link', () => {
  it('asks analytics to delete its clicks', async () => {
    const link = await create(alice, 'https://a.example.com');
    fetchMock.mockImplementation(async () => reply({ deleted: 3 }));
    expect((await send('DELETE', `/api/links/${link.id}/permanent`, { cookie: alice })).status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`http://127.0.0.1:9/internal/clicks/${link.id}`);
    expect(init.method).toBe('DELETE');
  });

  it('still deletes the link when analytics is down', async () => {
    const link = await create(alice, 'https://a.example.com');
    expect((await send('DELETE', `/api/links/${link.id}/permanent`, { cookie: alice })).status).toBe(204);
    expect((await send('GET', `/api/links/${link.id}`, { cookie: alice })).status).toBe(404);
  });
});

describe('GET /api/stats/summary', () => {
  it('returns totals and the top links by clicks', async () => {
    const a = await create(alice, 'https://a.example.com');
    const b = await create(alice, 'https://b.example.com');
    const c = await create(alice, 'https://c.example.com');
    await send('PATCH', `/api/links/${c.id}`, { cookie: alice, body: { isActive: false } });
    fetchMock.mockImplementation(async () => reply({ counts: { [a.id]: 2, [b.id]: 9, [c.id]: 0 }, totalClicks: 11 }));
    const s = await json(await send('GET', '/api/stats/summary', { cookie: alice }));
    expect(s).toMatchObject({ totalLinks: 3, activeLinks: 2, totalClicks: 11, analyticsAvailable: true });
    expect(s.topLinks.map((l: { id: number }) => l.id)).toEqual([b.id, a.id]);
  });
});
