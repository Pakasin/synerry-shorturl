import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db, sql } from '../db/client';
import { sessions, users } from '../db/schema';
import { refreshBlocklist } from '../links/blocklist';
import * as h from '../../test/helpers';
import { json, registerAndLogin } from '../../test/helpers';

let app: ReturnType<typeof createApp>;
let admin: string;
let alice: string;
let aliceId: number;

const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
const INTERNAL = { 'x-internal-key': 'test-internal-key' };

beforeEach(async () => {
  await sql`truncate users, links, sessions, blocked_domains restart identity cascade`;
  await refreshBlocklist();
  app = createApp();
  admin = await registerAndLogin(app, 'boss');
  await db.update(users).set({ role: 'admin' }).where(eq(users.username, 'boss'));
  alice = await registerAndLogin(app, 'alice');
  [{ id: aliceId }] = await db.select({ id: users.id }).from(users).where(eq(users.username, 'alice'));
});

afterAll(async () => {
  await sql.end();
});

describe('access control', () => {
  it('hides every admin route from normal users with 404, and from guests with 401', async () => {
    for (const path of ['/api/admin/summary', '/api/admin/users', '/api/admin/links', '/api/admin/blocklist']) {
      expect((await send('GET', path, { cookie: alice })).status).toBe(404);
    }
    expect((await send('GET', '/api/admin/summary')).status).toBe(401);
    expect((await send('GET', '/api/admin/summary', { cookie: admin })).status).toBe(200);
  });

  it('reports the role in /me so the web app can show the admin menu', async () => {
    expect((await json(await send('GET', '/api/auth/me', { cookie: admin }))).user.role).toBe('admin');
    expect((await json(await send('GET', '/api/auth/me', { cookie: alice }))).user.role).toBe('user');
  });

  it('never lets someone register as an admin', async () => {
    const res = await send('POST', '/api/auth/register', {
      body: { username: 'sneaky', password: 'Password123', role: 'admin' },
    });
    expect((await json(res)).user.role).toBe('user');
  });
});

describe('suspending users', () => {
  it('logs the user out everywhere, blocks login, and stops all their links', async () => {
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://example.com', alias: 'alice-link' } });
    const res = await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: false } });
    expect(res.status).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.userId, aliceId))).toHaveLength(0);
    expect((await send('GET', '/api/auth/me', { cookie: alice })).status).toBe(401);
    const login = await send('POST', '/api/auth/login', { body: { username: 'alice', password: 'Password123' } });
    expect(login.status).toBe(403);
    expect((await json(login)).error.code).toBe('account_suspended');
    expect((await json(await send('GET', '/internal/links/alice-link', { headers: INTERNAL }))).isActive).toBe(false);
    await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: true } });
    expect((await json(await send('GET', '/internal/links/alice-link', { headers: INTERNAL }))).isActive).toBe(true);
  });

  it('refuses to suspend yourself or another admin', async () => {
    const [{ id: bossId }] = await db.select({ id: users.id }).from(users).where(eq(users.username, 'boss'));
    expect(
      (await send('PATCH', `/api/admin/users/${bossId}`, { cookie: admin, body: { isActive: false } })).status,
    ).toBe(400);
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, aliceId));
    expect(
      (await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: false } })).status,
    ).toBe(400);
  });

  it('lists users with their link counts and supports search', async () => {
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://a.example.com' } });
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://b.example.com' } });
    const list = await json(await send('GET', '/api/admin/users?q=ali', { cookie: admin }));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ username: 'alice', linkCount: 2, isActive: true, role: 'user' });
    expect(JSON.stringify(list)).not.toContain('password');
  });
});

describe('locking links', () => {
  it('locks a link with a reason, the owner cannot re-enable it, and unlocking restores it', async () => {
    const { link } = await json(
      await send('POST', '/api/links', { cookie: alice, body: { url: 'https://example.com', alias: 'suspect' } }),
    );
    expect((await send('POST', `/api/admin/links/${link.id}/lock`, { cookie: admin, body: {} })).status).toBe(400);
    const locked = await json(
      await send('POST', `/api/admin/links/${link.id}/lock`, {
        cookie: admin,
        body: { reason: 'Reported as phishing' },
      }),
    );
    expect(locked.link.status).toBe('locked');
    const own = await json(await send('GET', `/api/links/${link.id}`, { cookie: alice }));
    expect(own.link).toMatchObject({ status: 'locked', lockReason: 'Reported as phishing' });
    const reopen = await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: { isActive: true } });
    expect(reopen.status).toBe(403);
    expect((await json(await send('GET', '/internal/links/suspect', { headers: INTERNAL }))).isActive).toBe(false);
    expect((await send('POST', `/api/admin/links/${link.id}/unlock`, { cookie: alice })).status).toBe(404);
    await send('POST', `/api/admin/links/${link.id}/unlock`, { cookie: admin });
    expect((await json(await send('GET', '/internal/links/suspect', { headers: INTERNAL }))).isActive).toBe(true);
  });

  it("lists everyone's links with owner names, and filters locked ones", async () => {
    const { link } = await json(
      await send('POST', '/api/links', { cookie: alice, body: { url: 'https://a.example.com' } }),
    );
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://b.example.com' } });
    await send('POST', `/api/admin/links/${link.id}/lock`, { cookie: admin, body: { reason: 'Spam' } });
    const all = await json(await send('GET', '/api/admin/links', { cookie: admin }));
    expect(all.total).toBe(2);
    expect(all.items[0].owner).toBe('alice');
    const locked = await json(await send('GET', '/api/admin/links?filter=locked', { cookie: admin }));
    expect(locked.items.map((l: { id: number }) => l.id)).toEqual([link.id]);
    expect((await json(await send('GET', '/api/admin/links?q=alice', { cookie: admin }))).total).toBe(2);
  });
});

describe('blocklist management', () => {
  it('adds a domain (from a pasted URL too), which blocks new links and old ones immediately, then removes it', async () => {
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://bad-site.test/page', alias: 'oldbad' } });
    const add = await send('POST', '/api/admin/blocklist', {
      cookie: admin,
      body: { url: '', domain: 'https://Bad-Site.test/login', reason: 'Phishing' },
    });
    expect(add.status).toBe(201);
    const { item } = await json(add);
    expect(item.domain).toBe('bad-site.test');
    expect(
      (await send('POST', '/api/links', { cookie: alice, body: { url: 'https://www.bad-site.test/x' } })).status,
    ).toBe(400);
    expect((await json(await send('GET', '/internal/links/oldbad', { headers: INTERNAL }))).blocked).toBe(true);
    expect(
      (await send('POST', '/api/admin/blocklist', { cookie: admin, body: { domain: 'bad-site.test' } })).status,
    ).toBe(409);
    expect((await send('DELETE', `/api/admin/blocklist/${item.id}`, { cookie: admin })).status).toBe(204);
    expect(
      (await send('POST', '/api/links', { cookie: alice, body: { url: 'https://www.bad-site.test/x' } })).status,
    ).toBe(201);
  });

  it('rejects things that are not domains, and shows the built-in list', async () => {
    expect(
      (await send('POST', '/api/admin/blocklist', { cookie: admin, body: { domain: 'not a domain' } })).status,
    ).toBe(400);
    const list = await json(await send('GET', '/api/admin/blocklist', { cookie: admin }));
    expect(list.builtIn).toContain('bit.ly');
    expect((await send('POST', '/api/admin/blocklist', { cookie: admin, body: { domain: 'bit.ly' } })).status).toBe(
      409,
    );
  });
});

describe('summary', () => {
  it('counts users, suspended users, links and locked links', async () => {
    const { link } = await json(
      await send('POST', '/api/links', { cookie: alice, body: { url: 'https://a.example.com' } }),
    );
    await send('POST', `/api/admin/links/${link.id}/lock`, { cookie: admin, body: { reason: 'Spam' } });
    await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: false } });
    const s = await json(await send('GET', '/api/admin/summary', { cookie: admin }));
    expect(s).toMatchObject({ users: 2, suspendedUsers: 1, links: 1, lockedLinks: 1, linksLast7Days: 1 });
  });
});
