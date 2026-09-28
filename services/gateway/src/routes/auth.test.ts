import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app';
import { db, sql } from '../db/client';
import { sessions } from '../db/schema';
import { hashToken } from '../auth/session';

import * as h from '../../test/helpers';
import { json, sidCookie } from '../../test/helpers';

let app: ReturnType<typeof createApp>;

const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);

const alice = { username: 'alice', password: 'Password123' };

beforeEach(async () => {
  await sql`truncate users, links, sessions restart identity cascade`;
  app = createApp();
});

afterAll(async () => {
  await sql.end();
});

describe('POST /api/auth/register', () => {
  it('creates the user, sets an HttpOnly session cookie, and logs in', async () => {
    const res = await send('POST', '/api/auth/register', { body: alice });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.user.username).toBe('alice');
    expect(JSON.stringify(body)).not.toContain('password');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^sid=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const me = await send('GET', '/api/auth/me', { cookie: sidCookie(res) });
    expect(me.status).toBe(200);
    expect((await json(me)).user.username).toBe('alice');
  });

  it('rejects a duplicate username with 409, case-insensitive', async () => {
    await send('POST', '/api/auth/register', { body: alice });
    const res = await send('POST', '/api/auth/register', { body: { ...alice, username: 'ALICE' } });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('username_taken');
  });

  it('rejects invalid input with 400 and field details', async () => {
    const res = await send('POST', '/api/auth/register', { body: { username: 'a!', password: '123' } });
    expect(res.status).toBe(400);
    const fields = (await json(res)).error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('username');
    expect(fields).toContain('password');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await send('POST', '/api/auth/register', { body: alice });
    const res = await send('POST', '/api/auth/login', { body: alice });
    expect(res.status).toBe(200);
    expect(sidCookie(res)).toMatch(/^sid=.+/);
  });

  it('returns the same 401 message for a wrong password and an unknown user', async () => {
    await send('POST', '/api/auth/register', { body: alice });
    const wrongPass = await send('POST', '/api/auth/login', { body: { ...alice, password: 'WrongPass999' } });
    const noUser = await send('POST', '/api/auth/login', { body: { username: 'nobody', password: 'Password123' } });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await json(wrongPass)).toEqual(await json(noUser));
  });

  it('stores only the sha256 hash of the token, never the raw token', async () => {
    const res = await send('POST', '/api/auth/register', { body: alice });
    const token = sidCookie(res).slice('sid='.length);
    expect(await db.select().from(sessions).where(eq(sessions.id, token))).toHaveLength(0);
    expect(
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, hashToken(token))),
    ).toHaveLength(1);
  });

  it('rate-limits after 10 attempts with 429', async () => {
    for (let i = 0; i < 10; i++) {
      await send('POST', '/api/auth/login', { body: { username: 'nobody', password: 'Password123' } });
    }
    const res = await send('POST', '/api/auth/login', { body: alice });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('session lifecycle', () => {
  it('logout revokes the session immediately on the server', async () => {
    const cookie = sidCookie(await send('POST', '/api/auth/register', { body: alice }));
    const out = await send('POST', '/api/auth/logout', { cookie });
    expect(out.status).toBe(204);
    const me = await send('GET', '/api/auth/me', { cookie });
    expect(me.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const cookie = sidCookie(await send('POST', '/api/auth/register', { body: alice }));
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    const me = await send('GET', '/api/auth/me', { cookie });
    expect(me.status).toBe(401);
  });

  it('rejects /me without a cookie or with a made-up cookie', async () => {
    expect((await send('GET', '/api/auth/me')).status).toBe(401);
    expect((await send('GET', '/api/auth/me', { cookie: 'sid=made-up-token' })).status).toBe(401);
  });

  it('issues a new session on login, so an old token cannot be reused (session fixation)', async () => {
    const first = sidCookie(await send('POST', '/api/auth/register', { body: alice }));
    const second = sidCookie(await send('POST', '/api/auth/login', { body: alice, cookie: first }));
    expect(second).not.toBe(first);
    expect((await send('GET', '/api/auth/me', { cookie: first })).status).toBe(401);
    expect((await send('GET', '/api/auth/me', { cookie: second })).status).toBe(200);
  });
});

describe('onboarding guide', () => {
  it('starts as not seen, and is remembered after POST /onboarding (repeat calls keep the first time)', async () => {
    const reg = await send('POST', '/api/auth/register', { body: alice });
    expect((await json(reg)).user.onboardedAt).toBeNull();
    const cookie = sidCookie(reg);
    const first = (await json(await send('POST', '/api/auth/onboarding', { cookie }))).user.onboardedAt;
    expect(first).toBeTruthy();
    expect((await json(await send('GET', '/api/auth/me', { cookie }))).user.onboardedAt).toBe(first);
    expect((await json(await send('POST', '/api/auth/onboarding', { cookie }))).user.onboardedAt).toBe(first);
  });

  it('requires login', async () => {
    expect((await send('POST', '/api/auth/onboarding')).status).toBe(401);
  });
});

describe('CSRF origin check', () => {
  it('blocks a POST coming from another website with 403', async () => {
    const res = await send('POST', '/api/auth/register', { body: alice, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('allows a POST from our own frontend origin', async () => {
    const res = await send('POST', '/api/auth/register', { body: alice, origin: 'http://localhost:5173' });
    expect(res.status).toBe(201);
  });
});
