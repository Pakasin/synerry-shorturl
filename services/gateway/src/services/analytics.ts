import { createLogger, INTERNAL_KEY_HEADER } from '@synerry/shared';
import { config } from '../config';

const log = createLogger('gateway');

async function callAnalytics<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${config.analyticsUrl}${path}`, {
      method,
      headers: { [INTERNAL_KEY_HEADER]: config.internalApiKey ?? '', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.analyticsTimeoutMs),
    });
    if (!res.ok) {
      log.warn('analytics responded with an error', { path, status: res.status });
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log.warn('analytics unavailable', { path, message: (err as Error).message });
    return null;
  }
}

export type LinkStats = Record<string, unknown> & { totalClicks: number };

export type ClickCounts = { counts: Record<string, number>; totalClicks: number };

export function getClickCounts(linkIds: number[]): Promise<ClickCounts | null> {
  if (linkIds.length === 0) return Promise.resolve({ counts: {}, totalClicks: 0 });
  return callAnalytics<ClickCounts>('POST', '/internal/stats/summary', { linkIds });
}

export async function loadClickCounts(linkIds: number[]) {
  const data = await getClickCounts(linkIds);
  return {
    available: data !== null,
    total: data?.totalClicks ?? null,
    of: (linkId: number) => (data ? (data.counts[linkId] ?? 0) : null),
  };
}

export function getLinkStats(linkId: number, days: number) {
  return callAnalytics<LinkStats>('GET', `/internal/stats/${linkId}?days=${days}`);
}

export function deleteLinkClicks(linkId: number) {
  return callAnalytics<{ deleted: number }>('DELETE', `/internal/clicks/${linkId}`);
}
