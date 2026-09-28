import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { createApp } from '../app';
import { db, sql } from '../db/client';
import { links, users } from '../db/schema';
import * as h from '../../test/helpers';
import { json, registerAndLogin } from '../../test/helpers';

let app: ReturnType<typeof createApp>;
let alice: string;
let bob: string;

const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
const create = (cookie: string, body: Record<string, unknown>) => send('POST', '/api/links', { cookie, body });
const createOk = async (cookie: string, body: Record<string, unknown>) => (await json(await create(cookie, body))).link;
const INTERNAL = { 'x-internal-key': 'test-internal-key' };
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeEach(async () => {
  await sql`truncate users, links, sessions restart identity cascade`;
  app = createApp();
  alice = await registerAndLogin(app, 'alice');
  bob = await registerAndLogin(app, 'bob');
});

afterAll(async () => {
  await sql.end();
});

describe('URL safety', () => {
  it('normalises the URL so duplicates can be detected', async () => {
    const link = await createOk(alice, { url: 'HTTPS://WWW.Synerry.com' });
    expect(link.originalUrl).toBe('https://www.synerry.com/');
  });

  it.each([
    ['another shortener', 'https://bit.ly/abc'],
    ['a subdomain of a blocked domain', 'https://evil.bit.ly/x'],
    ['a known unsafe domain', 'https://login.phishing.example/'],
    ['a URL with a username trick', 'https://www.bank.com@evil.test/'],
  ])('rejects %s', async (_name, url) => {
    const res = await create(alice, { url });
    expect(res.status).toBe(400);
    expect((await json(res)).error.details[0].field).toBe('url');
  });

  it('marks a link as blocked in the internal lookup if its domain is on the list', async () => {
    const [u] = await db.select().from(users).where(eq(users.username, 'alice'));
    await db.insert(links).values({ userId: u.id, originalUrl: 'https://bit.ly/old', shortCode: 'oldone' });
    const res = await json(await send('GET', '/internal/links/oldone', { headers: INTERNAL }));
    expect(res.blocked).toBe(true);
  });
});

describe('tags', () => {
  it('stores tags without duplicates, lists them with counts, and filters the history', async () => {
    const a = await createOk(alice, { url: 'https://a.example.com', tags: ['Marketing', 'marketing', 'ตุลาคม'] });
    await createOk(alice, { url: 'https://b.example.com', tags: ['Marketing'] });
    await createOk(alice, { url: 'https://c.example.com' });
    expect(a.tags).toEqual(['Marketing', 'ตุลาคม']);
    const tags = (await json(await send('GET', '/api/links/tags', { cookie: alice }))).tags;
    expect(tags).toEqual([
      { name: 'Marketing', count: 2 },
      { name: 'ตุลาคม', count: 1 },
    ]);
    const list = await json(await send('GET', `/api/links?tag=${encodeURIComponent('ตุลาคม')}`, { cookie: alice }));
    expect(list.items.map((l: { id: number }) => l.id)).toEqual([a.id]);
  });

  it('rejects more than 10 tags', async () => {
    const res = await create(alice, {
      url: 'https://a.example.com',
      tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
    });
    expect(res.status).toBe(400);
  });
});

describe('start date (scheduled links)', () => {
  it('shows a future start date as "scheduled", and gives redirect the start date', async () => {
    const link = await createOk(alice, { url: 'https://a.example.com', alias: 'soon', startsAt: hoursFromNow(24) });
    expect(link.status).toBe('scheduled');
    const internal = await json(await send('GET', '/internal/links/soon', { headers: INTERNAL }));
    expect(internal.startsAt).toBe(link.startsAt);
  });

  it('requires the start date to be before the expiry, on create and on edit', async () => {
    const bad = await create(alice, {
      url: 'https://a.example.com',
      startsAt: hoursFromNow(48),
      expiresAt: hoursFromNow(24),
    });
    expect(bad.status).toBe(400);
    const link = await createOk(alice, { url: 'https://a.example.com', expiresAt: hoursFromNow(24) });
    const edit = await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: { startsAt: hoursFromNow(48) } });
    expect(edit.status).toBe(400);
  });
});

describe('duplicate check', () => {
  it('finds my existing links to the same URL, including older ones saved without a trailing slash', async () => {
    const [u] = await db.select().from(users).where(eq(users.username, 'alice'));
    await db.insert(links).values({ userId: u.id, originalUrl: 'https://www.synerry.com', shortCode: 'legacy' });
    await createOk(alice, { url: 'https://www.synerry.com/' });
    await createOk(bob, { url: 'https://www.synerry.com/' });
    const res = await json(
      await send('GET', `/api/links/duplicates?url=${encodeURIComponent('HTTPS://www.synerry.COM')}`, {
        cookie: alice,
      }),
    );
    expect(res.items).toHaveLength(2);
  });
});

describe('trash', () => {
  it('moves a link to trash, restores it, then deletes it permanently', async () => {
    const link = await createOk(alice, { url: 'https://a.example.com', alias: 'mylink' });
    expect((await send('DELETE', `/api/links/${link.id}`, { cookie: alice })).status).toBe(204);
    expect((await json(await send('GET', '/api/links', { cookie: alice }))).total).toBe(0);
    expect((await send('GET', '/internal/links/mylink', { headers: INTERNAL })).status).toBe(404);
    const trash = await json(await send('GET', '/api/links/trash', { cookie: alice }));
    expect(trash.items.map((l: { id: number }) => l.id)).toEqual([link.id]);
    expect(trash.retentionDays).toBe(30);
    expect((await create(bob, { url: 'https://evil.example.com', alias: 'mylink' })).status).toBe(409);
    expect((await send('POST', `/api/links/${link.id}/restore`, { cookie: bob })).status).toBe(404);
    expect((await send('POST', `/api/links/${link.id}/restore`, { cookie: alice })).status).toBe(200);
    expect((await send('GET', '/internal/links/mylink', { headers: INTERNAL })).status).toBe(200);
    expect((await send('DELETE', `/api/links/${link.id}/permanent`, { cookie: alice })).status).toBe(204);
    expect((await json(await send('GET', '/api/links/trash', { cookie: alice }))).items).toHaveLength(0);
  });

  it('permanently removes links that have been in the trash longer than 30 days', async () => {
    const old = await createOk(alice, { url: 'https://old.example.com' });
    const recent = await createOk(alice, { url: 'https://new.example.com' });
    await send('DELETE', `/api/links/${old.id}`, { cookie: alice });
    await send('DELETE', `/api/links/${recent.id}`, { cookie: alice });
    await db
      .update(links)
      .set({ deletedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(links.id, old.id));
    const trash = await json(await send('GET', '/api/links/trash', { cookie: alice }));
    expect(trash.items.map((l: { id: number }) => l.id)).toEqual([recent.id]);
    expect(await db.select().from(links).where(eq(links.id, old.id))).toHaveLength(0);
  });
});

describe('GET /api/links/export.xlsx', () => {
  it('downloads a real Excel file with only my links', async () => {
    await createOk(alice, { url: 'https://www.synerry.com', title: '=1+1', tags: ['ทดสอบ'] });
    await createOk(bob, { url: 'https://bob.example.com' });
    const res = await send('GET', '/api/links/export.xlsx', { cookie: alice });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.getWorksheet('Links')!;
    expect(ws.rowCount).toBe(2);
    expect(ws.getCell('C2').value).toBe('=1+1');
    expect(ws.getCell('C2').formula).toBeUndefined();
    expect(ws.getCell('D2').value).toBe('ทดสอบ');
  });
});
