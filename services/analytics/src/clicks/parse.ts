import { createHash } from 'node:crypto';
import UAParser from 'ua-parser-js';
import { config } from '../config';

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|curl|wget|python-requests|headless/i;

export type ParsedAgent = { deviceType: string; browser: string | null; os: string | null };

export function parseUserAgent(userAgent: string | undefined): ParsedAgent {
  if (!userAgent) return { deviceType: 'other', browser: null, os: null };
  if (BOT_PATTERN.test(userAgent)) return { deviceType: 'bot', browser: null, os: null };
  const result = new UAParser(userAgent).getResult();
  const type = result.device.type;
  const deviceType = type === 'mobile' || type === 'tablet' ? type : type ? 'other' : 'desktop';
  return {
    deviceType,
    browser: result.browser.name?.slice(0, 50) ?? null,
    os: result.os.name?.slice(0, 50) ?? null,
  };
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${config.ipHashSalt}:${ip}`).digest('hex');
}
