import type { Link } from '../db/schema';
import { config } from '../config';

export type LinkStatus = 'active' | 'locked' | 'disabled' | 'expired' | 'scheduled';

export function linkStatus(
  link: Pick<Link, 'isActive' | 'expiresAt' | 'startsAt' | 'lockedAt'>,
  now = new Date(),
): LinkStatus {
  if (link.lockedAt) return 'locked';
  if (!link.isActive) return 'disabled';
  if (link.expiresAt && link.expiresAt <= now) return 'expired';
  if (link.startsAt && link.startsAt > now) return 'scheduled';
  return 'active';
}

export function toLinkDto(link: Link) {
  return {
    id: link.id,
    originalUrl: link.originalUrl,
    shortCode: link.shortCode,
    shortUrl: `${config.shortBaseUrl}/${link.shortCode}`,
    title: link.title,
    tags: link.tags,
    isActive: link.isActive,
    startsAt: link.startsAt,
    expiresAt: link.expiresAt,
    status: linkStatus(link),
    deletedAt: link.deletedAt,
    lockedAt: link.lockedAt,
    lockReason: link.lockReason,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}
