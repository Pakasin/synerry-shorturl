import { createMiddleware } from 'hono/factory';
import { apiError } from '@synerry/shared';
import type { AppEnv } from '../types';

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'admin') return c.json(apiError('not_found', 'Route not found'), 404);
  await next();
});
