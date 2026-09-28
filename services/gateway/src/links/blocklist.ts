import { createLogger } from '@synerry/shared';
import { db } from '../db/client';
import { blockedDomains } from '../db/schema';

const logger = createLogger('gateway');

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

// Threat-feed blocklist: external domains pulled from public feeds, refreshed in the background.
// Kept out of `dbBlocked`/`refreshBlocklist` so admin.test.ts's beforeEach stays network-free.

type FeedSource = { name: string; url: string };

const FEEDS: FeedSource[] = [
  { name: 'urlhaus', url: 'https://urlhaus.abuse.ch/downloads/hostfile/' },
  { name: 'threatfox', url: 'https://threatfox.abuse.ch/downloads/hostfile/' },
  { name: 'blocklistproject-phishing', url: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/phishing.txt' },
  { name: 'blocklistproject-malware', url: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt' },
  { name: 'blocklistproject-scam', url: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/scam.txt' },
];

// Cap on the Render free/starter 512MB instance: ~250k short strings in a Set is a few tens of MB.
const MAX_FEED_DOMAINS = 250_000;
const MAX_PER_FEED = 100_000;
const FETCH_TIMEOUT_MS = 20_000;
const FEED_DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

let feedBlocked = new Set<string>();

export type FeedSourceStatus = { name: string; count: number; error: string | null };

export type FeedStatus = {
  domainCount: number;
  lastUpdatedAt: string | null;
  sources: FeedSourceStatus[];
};

let feedStatus: FeedStatus = { domainCount: 0, lastUpdatedAt: null, sources: [] };

function parseHostsList(text: string): string[] {
  const domains: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const parts = line.split(/\s+/);
    // Hosts-file format: "0.0.0.0 domain" or "127.0.0.1 domain"; plain lists are just "domain".
    const candidate = (parts.length > 1 && /^[\d.:a-f]+$/i.test(parts[0]) ? parts[1] : parts[0])?.toLowerCase();
    if (candidate && FEED_DOMAIN_PATTERN.test(candidate)) domains.push(candidate);
    if (domains.length >= MAX_PER_FEED) break;
  }
  return domains;
}

async function fetchFeed(source: FeedSource): Promise<{ domains: string[]; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, { signal: controller.signal });
    if (!res.ok) return { domains: [], error: `HTTP ${res.status}` };
    const text = await res.text();
    return { domains: parseHostsList(text), error: null };
  } catch (err) {
    return { domains: [], error: err instanceof Error ? err.message : 'fetch failed' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshFeedBlocklist(): Promise<void> {
  const results = await Promise.all(FEEDS.map((source) => fetchFeed(source)));
  const merged = new Set<string>();
  const sources: FeedSourceStatus[] = [];

  for (let i = 0; i < FEEDS.length; i++) {
    const source = FEEDS[i];
    const { domains, error } = results[i];
    if (error) logger.warn('threat feed fetch failed', { feed: source.name, error });
    for (const domain of domains) {
      if (merged.size >= MAX_FEED_DOMAINS) break;
      merged.add(domain);
    }
    sources.push({ name: source.name, count: domains.length, error });
  }

  // If every feed failed, keep serving the previous snapshot instead of wiping the list.
  if (merged.size === 0 && sources.every((s) => s.error)) {
    logger.warn('all threat feeds failed, keeping previous blocklist snapshot', {
      domainCount: feedStatus.domainCount,
    });
    return;
  }

  feedBlocked = merged;
  feedStatus = { domainCount: merged.size, lastUpdatedAt: new Date().toISOString(), sources };
  logger.info('threat feed blocklist refreshed', { domainCount: merged.size });
}

export function getFeedStatus(): FeedStatus {
  return feedStatus;
}

// Synchronous private-network / localhost check for SSRF protection. Only handles literal IPs
// and well-known local hostnames — no DNS resolution, so it can run inline on every request.
function isPrivateOrLocalHost(hostname: string): boolean {
  const host = normalizeDomain(hostname);
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true; // "this network"
    return false;
  }

  const bare = host.replace(/^\[|\]$/g, '');
  if (bare === '::1') return true; // loopback
  if (bare.includes(':')) {
    const lower = bare.toLowerCase();
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true; // link-local / ULA
    if (lower.startsWith('::ffff:')) return isPrivateOrLocalHost(lower.slice(7)); // IPv4-mapped
  }
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  if (isPrivateOrLocalHost(hostname)) return true;
  const parts = normalizeDomain(hostname).split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (staticBlocked.has(candidate) || dbBlocked.has(candidate) || feedBlocked.has(candidate)) return true;
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
