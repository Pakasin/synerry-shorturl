import { isIPv4, isIPv6 } from 'node:net';
import geoip from 'fast-geoip';

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function isPublicIp(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIPv4(v4)) return !isPrivateV4(v4);
  if (isIPv6(ip)) return !(ip === '::1' || /^f[cd]/i.test(ip) || /^fe[89ab]/i.test(ip));
  return false;
}

export async function countryFromIp(ip: string | undefined): Promise<string | null> {
  if (!ip || !isPublicIp(ip)) return null;
  try {
    const result = await geoip.lookup(ip.startsWith('::ffff:') ? ip.slice(7) : ip);
    return result?.country && /^[A-Z]{2}$/.test(result.country) ? result.country : null;
  } catch {
    return null;
  }
}
