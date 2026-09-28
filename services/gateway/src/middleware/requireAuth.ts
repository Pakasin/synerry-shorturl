import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { getSessionUser } from '../auth/session';
import { config } from '../config';
import { apiError } from '@synerry/shared';
import type { AppEnv } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, config.sessionCookieName);
  if (!token) return c.json(apiError('unauthorized', 'Please log in'), 401);
  const user = await getSessionUser(token);
  if (!user) return c.json(apiError('unauthorized', 'Session expired, please log in again'), 401);
  c.set('user', user);
  await next();
});
