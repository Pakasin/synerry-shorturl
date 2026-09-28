import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { apiError } from './errors';

export const INTERNAL_KEY_HEADER = 'x-internal-key';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function requireInternalKey(getKey: () => string | undefined) {
  return createMiddleware(async (c, next) => {
    const expected = getKey();
    const given = c.req.header(INTERNAL_KEY_HEADER);
    if (!expected || !given || !safeEqual(given, expected)) {
      return c.json(apiError('unauthorized', 'Invalid internal key'), 401);
    }
    await next();
  });
}
