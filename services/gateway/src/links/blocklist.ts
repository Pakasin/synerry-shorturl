import { db } from '../db/client';
import { blockedDomains } from '../db/schema';

export const BUILT_IN_BLOCKED = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'tiny.cc',
  'shorturl.at',
  'rb.gy',
  'v.gd',
  'phishing.example',
  'malware.example',
];

const staticBlocked = new Set(
  [...BUILT_IN_BLOCKED, ...(process.env.BLOCKED_DOMAINS ?? '').split(',')]
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
);

let dbBlocked = new Set<string>();

export async function refreshBlocklist(): Promise<void> {
  const rows = await db.select({ domain: blockedDomains.domain }).from(blockedDomains);
  dbBlocked = new Set(rows.map((r) => r.domain));
}

export const normalizeDomain = (host: string) => host.trim().toLowerCase().replace(/\.$/, '');

export function isBlockedHost(hostname: string): boolean {
  const parts = normalizeDomain(hostname).split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (staticBlocked.has(candidate) || dbBlocked.has(candidate)) return true;
  }
  return false;
}

export function isBlockedUrl(url: string): boolean {
  try {
    return isBlockedHost(new URL(url).hostname);
  } catch {
    return true;
  }
}
