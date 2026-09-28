import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';
import { config } from '../config';

export const publicUserColumns = {
  id: users.id,
  username: users.username,
  role: users.role,
  onboardedAt: users.onboardedAt,
  createdAt: users.createdAt,
};

export type SessionUser = { id: number; username: string; role: string; onboardedAt: Date | null; createdAt: Date };

export const toSessionUser = ({ id, username, role, onboardedAt, createdAt }: SessionUser): SessionUser => ({
  id,
  username,
  role,
  onboardedAt,
  createdAt,
});

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select(publicUserColumns)
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.isActive, true)));
  return row ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
