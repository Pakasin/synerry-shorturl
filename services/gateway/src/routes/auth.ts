import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiError } from '@synerry/shared';
import { db } from '../db/client';
import { users } from '../db/schema';
import { createSession, deleteExpiredSessions, deleteSession, publicUserColumns, toSessionUser } from '../auth/session';
import { config } from '../config';
import { requireAuth } from '../middleware/requireAuth';
import { rateLimit } from '../middleware/rateLimit';
import { invalid, readJson } from '../http';
import type { AppEnv } from '../types';

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Username may contain only letters, numbers and _'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

function setSessionCookie(c: Context, token: string, expiresAt: Date) {
  setCookie(c, config.sessionCookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
}

export function authRoutes() {
  const r = new Hono<AppEnv>();
  const limiter = rateLimit({ max: 10, windowMs: 15 * 60 * 1000 });

  r.post('/register', limiter, async (c) => {
    const parsed = credentialsSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error);
    const { username, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash })
      .onConflictDoNothing({ target: users.username })
      .returning(publicUserColumns);
    if (!user) return c.json(apiError('username_taken', 'This username is already taken'), 409);
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(c, token, expiresAt);
    return c.json({ user }, 201);
  });

  r.post('/login', limiter, async (c) => {
    const parsed = credentialsSchema.safeParse(await readJson(c));
    const rejected = () => c.json(apiError('invalid_credentials', 'Invalid username or password'), 401);
    if (!parsed.success) return rejected();
    const { username, password } = parsed.data;
    const [user] = await db.select().from(users).where(eq(users.username, username));
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) return rejected();
    if (!user.isActive) return c.json(apiError('account_suspended', 'This account has been suspended'), 403);
    const oldToken = getCookie(c, config.sessionCookieName);
    if (oldToken) await deleteSession(oldToken);
    await deleteExpiredSessions();
    const { token, expiresAt } = await createSession(user.id);
    setSessionCookie(c, token, expiresAt);
    return c.json({ user: toSessionUser(user) });
  });

  r.post('/logout', async (c) => {
    const token = getCookie(c, config.sessionCookieName);
    if (token) await deleteSession(token);
    deleteCookie(c, config.sessionCookieName, { path: '/' });
    return c.body(null, 204);
  });

  r.post('/onboarding', requireAuth, async (c) => {
    const user = c.get('user');
    const [updated] = await db
      .update(users)
      .set({ onboardedAt: user.onboardedAt ?? new Date() })
      .where(eq(users.id, user.id))
      .returning(publicUserColumns);
    return c.json({ user: updated });
  });

  r.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }));

  return r;
}
