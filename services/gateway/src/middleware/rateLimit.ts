import { createMiddleware } from 'hono/factory';
import { apiError } from '@synerry/shared';

export function rateLimit(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return createMiddleware(async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    if (entry.count >= opts.max) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json(apiError('rate_limited', 'Too many attempts, please try again later'), 429);
    }
    entry.count += 1;
    await next();
  });
}
