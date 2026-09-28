// นำเข้าฟังก์ชันสุ่มค่าที่ปลอดภัยและฟังก์ชัน hash จาก Node.js
import { createHash, randomBytes } from 'node:crypto';
// นำเข้าตัวสร้างเงื่อนไข query ของ Drizzle
import { and, eq, gt, lt } from 'drizzle-orm';
// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง
import { sessions, users } from '../db/schema';
// นำเข้าค่าตั้งค่า
import { config } from '../config';

// ข้อมูลผู้ใช้ที่ปลอดภัยพอจะส่งออกไปได้ ไม่มี password_hash
export type SessionUser = { id: number; username: string; role: string; onboardedAt: Date | null; createdAt: Date };

// แปลง token เป็นค่า sha256 เพื่อใช้เป็น id ในฐานข้อมูล
export function hashToken(token: string): string {
  // คืนค่า hash แบบเลขฐานสิบหก ยาว 64 ตัวอักษร
  return createHash('sha256').update(token).digest('hex');
}

// สร้าง session ใหม่ให้ผู้ใช้ แล้วคืน token ดิบที่จะใส่ใน cookie
export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  // สุ่ม 32 byte (256 bit) แล้วแปลงเป็นข้อความที่ใช้ใน cookie ได้ เดาไม่ได้ในทางปฏิบัติ
  const token = randomBytes(32).toString('base64url');
  // คำนวณเวลาหมดอายุจากเวลาปัจจุบันบวกจำนวนวันที่ตั้งไว้
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  // เก็บเฉพาะ hash ของ token ลงฐานข้อมูล
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // คืน token ดิบให้ผู้เรียกไปตั้ง cookie ค่านี้จะไม่ถูกเก็บที่ server
  return { token, expiresAt };
}

// หาผู้ใช้จาก token ใน cookie ถ้า session ไม่มีหรือหมดอายุจะคืน null
export async function getSessionUser(token: string): Promise<SessionUser | null> {
  // join ตาราง sessions กับ users และดึงเฉพาะคอลัมน์ที่ปลอดภัย
  const [row] = await db
    .select({ id: users.id, username: users.username, role: users.role, onboardedAt: users.onboardedAt, createdAt: users.createdAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // ต้องตรงกับ hash ของ token ยังไม่หมดอายุ และบัญชียังไม่ถูกระงับ
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.isActive, true)));
  // ถ้าไม่เจอให้คืน null
  return row ?? null;
}

// ลบ session ที่ตรงกับ token ใช้ตอน logout
export async function deleteSession(token: string): Promise<void> {
  // ลบแถวที่มี id ตรงกับ hash ของ token
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

// ลบ session ทั้งหมดของผู้ใช้หนึ่งคน ใช้ตอนระงับบัญชี ให้หลุดออกจากระบบทุกเครื่องทันที
export async function deleteUserSessions(userId: number): Promise<void> {
  // ลบทุกแถวของผู้ใช้คนนี้
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ลบ session ที่หมดอายุแล้วทั้งหมด เพื่อไม่ให้ตารางโตไม่หยุด
export async function deleteExpiredSessions(): Promise<void> {
  // ลบทุกแถวที่เวลาหมดอายุน้อยกว่าเวลาปัจจุบัน
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
