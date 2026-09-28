import { INTERNAL_KEY_HEADER } from '@synerry/shared';
import { config } from './config';

export type LinkInfo = {
  id: number;
  originalUrl: string;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  blocked: boolean;
};

export type LookupResult =
  { kind: 'found'; link: LinkInfo } | { kind: 'not_found' } | { kind: 'unavailable'; reason: string };

const internalHeaders = () => ({ [INTERNAL_KEY_HEADER]: config.internalApiKey, 'content-type': 'application/json' });

export async function lookupLink(code: string): Promise<LookupResult> {
  try {
    const res = await fetch(`${config.gatewayUrl}/internal/links/${encodeURIComponent(code)}`, {
      headers: internalHeaders(),
      signal: AbortSignal.timeout(config.lookupTimeoutMs),
    });
    if (res.status === 404) return { kind: 'not_found' };
    if (!res.ok) return { kind: 'unavailable', reason: `gateway HTTP ${res.status}` };
    return { kind: 'found', link: (await res.json()) as LinkInfo };
  } catch (err) {
    return { kind: 'unavailable', reason: (err as Error).message };
  }
}

export type ClickEvent = { linkId: number; clickedAt: string; ip?: string; userAgent?: string; referer?: string };

export async function recordClick(event: ClickEvent): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(`${config.analyticsUrl}/internal/clicks`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(config.clickTimeoutMs),
    });
    if (!res.ok) return { ok: false, reason: `analytics HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
