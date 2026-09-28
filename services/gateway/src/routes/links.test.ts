import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { sql } from '../db/client';
import * as h from '../../test/helpers';
import { json, registerAndLogin } from '../../test/helpers';

let app: ReturnType<typeof createApp>;
let alice: string;
let bob: string;

const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
const create = (cookie: string, body: Record<string, unknown>) => send('POST', '/api/links', { cookie, body });

beforeEach(async () => {
  await sql`truncate users, links, sessions restart identity cascade`;
  app = createApp();
  alice = await registerAndLogin(app, 'alice');
  bob = await registerAndLogin(app, 'bob');
});

afterAll(async () => {
  await sql.end();
});

describe('POST /api/links', () => {
  it('creates a link with a random 6-character code and a full short URL', async () => {
    const res = await create(alice, { url: 'https://www.synerry.com' });
    expect(res.status).toBe(201);
    const { link } = await json(res);
    expect(link.shortCode).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(link.shortUrl).toBe(`http://localhost:3002/${link.shortCode}`);
    expect(link.status).toBe('active');
    expect(link.userId).toBeUndefined();
  });

  it('uses a custom alias and rejects the same alias from anyone with 409', async () => {
    const first = await create(alice, { url: 'https://www.synerry.com', alias: 'synerry-home' });
    expect(first.status).toBe(201);
    expect((await json(first)).link.shortCode).toBe('synerry-home');
    const dup = await create(bob, { url: 'https://example.com', alias: 'synerry-home' });
    expect(dup.status).toBe(409);
    expect((await json(dup)).error.code).toBe('alias_taken');
  });

  it.each([
    ['javascript URL', { url: 'javascript:alert(1)' }, 'url'],
    ['not a URL', { url: 'hello world' }, 'url'],
    ['our own short domain', { url: 'http://localhost:3002/abc123' }, 'url'],
    ['reserved alias', { url: 'https://example.com', alias: 'API' }, 'alias'],
    ['alias with spaces', { url: 'https://example.com', alias: 'my link' }, 'alias'],
    ['expiry in the past', { url: 'https://example.com', expiresAt: '2020-01-01T00:00:00Z' }, 'expiresAt'],
  ])('rejects %s with 400 on the right field', async (_name, body, field) => {
    const res = await create(alice, body);
    expect(res.status).toBe(400);
    const fields = (await json(res)).error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain(field);
  });

  it('ignores a userId in the body, so nobody can create links for another user', async () => {
    const res = await create(alice, { url: 'https://example.com', userId: 2 });
    expect(res.status).toBe(201);
    const list = await json(await send('GET', '/api/links', { cookie: bob }));
    expect(list.total).toBe(0);
  });

  it('requires login', async () => {
    const res = await send('POST', '/api/links', { body: { url: 'https://example.com' } });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/links (history)', () => {
  it('lists only my links, newest first, with pagination and search', async () => {
    await create(alice, { url: 'https://a.example.com', title: 'First' });
    await create(alice, { url: 'https://b.example.com', title: '100% Second' });
    await create(alice, { url: 'https://c.example.com', title: 'Third' });
    await create(bob, { url: 'https://bob.example.com' });

    const page1 = await json(await send('GET', '/api/links?page=1&pageSize=2', { cookie: alice }));
    expect(page1.total).toBe(3);
    expect(page1.items.map((l: { title: string }) => l.title)).toEqual(['Third', '100% Second']);

    const search = await json(await send('GET', '/api/links?q=100%25', { cookie: alice }));
    expect(search.items.map((l: { title: string }) => l.title)).toEqual(['100% Second']);
  });
});

describe('ownership: another user cannot see or change my link', () => {
  it("returns 404 for GET, PATCH and DELETE on another user's link, and the link survives", async () => {
    const { link } = await json(await create(alice, { url: 'https://www.synerry.com' }));
    expect((await send('GET', `/api/links/${link.id}`, { cookie: bob })).status).toBe(404);
    expect((await send('PATCH', `/api/links/${link.id}`, { cookie: bob, body: { isActive: false } })).status).toBe(404);
    expect((await send('DELETE', `/api/links/${link.id}`, { cookie: bob })).status).toBe(404);
    const still = await json(await send('GET', `/api/links/${link.id}`, { cookie: alice }));
    expect(still.link.status).toBe('active');
  });
});

describe('PATCH and DELETE /api/links/:id', () => {
  it('updates title, disables the link, then clears the expiry', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const { link } = await json(await create(alice, { url: 'https://example.com', expiresAt: future }));
    const res = await send('PATCH', `/api/links/${link.id}`, {
      cookie: alice,
      body: { title: 'Renamed', isActive: false },
    });
    const updated = (await json(res)).link;
    expect(updated.title).toBe('Renamed');
    expect(updated.status).toBe('disabled');
    const cleared = (
      await json(await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: { expiresAt: null } }))
    ).link;
    expect(cleared.expiresAt).toBeNull();
  });

  it('rejects an empty update with 400', async () => {
    const { link } = await json(await create(alice, { url: 'https://example.com' }));
    expect((await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: {} })).status).toBe(400);
  });

  it('deletes my link', async () => {
    const { link } = await json(await create(alice, { url: 'https://example.com' }));
    expect((await send('DELETE', `/api/links/${link.id}`, { cookie: alice })).status).toBe(204);
    expect((await send('GET', `/api/links/${link.id}`, { cookie: alice })).status).toBe(404);
  });
});

describe('GET /internal/links/:code (used by the redirect service)', () => {
  it('requires the correct internal key', async () => {
    await create(alice, { url: 'https://www.synerry.com', alias: 'synerry' });
    expect((await send('GET', '/internal/links/synerry')).status).toBe(401);
    expect((await send('GET', '/internal/links/synerry', { headers: { 'x-internal-key': 'wrong' } })).status).toBe(401);
    expect((await send('GET', '/internal/links/synerry', { cookie: alice })).status).toBe(401);
  });

  it('returns only the fields redirect needs, and 404 for an unknown code', async () => {
    await create(alice, { url: 'https://www.synerry.com', alias: 'synerry' });
    const headers = { 'x-internal-key': 'test-internal-key' };
    const res = await send('GET', '/internal/links/synerry', { headers });
    expect(res.status).toBe(200);
    expect(Object.keys(await json(res)).sort()).toEqual([
      'blocked',
      'expiresAt',
      'id',
      'isActive',
      'originalUrl',
      'startsAt',
    ]);
    expect((await send('GET', '/internal/links/nope99', { headers })).status).toBe(404);
  });
});

describe('GET /api/links/export.csv', () => {
  it('downloads only my links as UTF-8 CSV with a BOM, and neutralises spreadsheet formulas', async () => {
    await create(alice, { url: 'https://www.synerry.com', title: 'ซินเนอร์รี่, "ทดสอบ"' });
    await create(alice, { url: 'https://example.com', title: '=HYPERLINK("http://evil.example")' });
    await create(bob, { url: 'https://bob.example.com' });

    const res = await send('GET', '/api/links/export.csv', { cookie: alice });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="synerry-links-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    const lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(text).toContain('"ซินเนอร์รี่, ""ทดสอบ"""');
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    expect(text).not.toContain('bob.example.com');
  });

  it('is not mistaken for a link id', async () => {
    expect((await send('GET', '/api/links/export.csv', { cookie: alice })).status).toBe(200);
  });
});
