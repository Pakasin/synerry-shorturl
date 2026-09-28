import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

const PROXY_SET_HEADERS = ['true-client-ip', 'cf-connecting-ip'];

function lastForwardedFor(c: Context): string | undefined {
  const hops = c.req
    .header('x-forwarded-for')
    ?.split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops?.at(-1);
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

export function clientIp(c: Context): string | undefined {
  for (const name of PROXY_SET_HEADERS) {
    const value = c.req.header(name)?.trim();
    if (value) return value;
  }
  return lastForwardedFor(c) ?? socketAddress(c);
}
