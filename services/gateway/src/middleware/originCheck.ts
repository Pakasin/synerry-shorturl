import { createMiddleware } from 'hono/factory';
import { config } from '../config';
import { apiError } from '@synerry/shared';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const originCheck = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header('origin');
  if (origin && !config.allowedOrigins.includes(origin)) {
    return c.json(apiError('forbidden_origin', 'Request origin is not allowed'), 403);
  }
  await next();
});
