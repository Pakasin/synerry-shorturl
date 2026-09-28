import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { links, type Link } from '../db/schema';
import { idParamSchema } from '../validation';

export const TRASH_RETENTION_DAYS = 30;

export const notDeleted = isNull(links.deletedAt);

export type LinkScope = 'active' | 'trash' | 'any';

export async function findOwnLink(rawId: string, userId: number, scope: LinkScope = 'active'): Promise<Link | null> {
  const id = idParamSchema.safeParse(rawId);
  if (!id.success) return null;
  const conditions: SQL[] = [eq(links.id, id.data), eq(links.userId, userId)];
  if (scope === 'active') conditions.push(notDeleted);
  if (scope === 'trash') conditions.push(isNotNull(links.deletedAt));
  const [link] = await db
    .select()
    .from(links)
    .where(and(...conditions));
  return link ?? null;
}
