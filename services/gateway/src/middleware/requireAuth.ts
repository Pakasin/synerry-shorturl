// นำเข้าตัวช่วยอ่าน cookie ของ Hono
import { getCookie } from 'hono/cookie';
// นำเข้าตัวช่วยสร้าง middleware แบบมีชนิดข้อมูล
import { createMiddleware } from 'hono/factory';
// นำเข้าฟังก์ชันหาผู้ใช้จาก session
import { getSessionUser } from '../auth/session';
// นำเข้าค่าตั้งค่า
import { config } from '../config';
// นำเข้าชนิดข้อมูลของ context และตัวช่วยสร้าง error
import { apiError, type AppEnv } from '../types';

// middleware บังคับว่าต้อง login ก่อนถึงจะเข้า route ที่ตามหลังได้
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  // อ่าน token จาก cookie
  const token = getCookie(c, config.sessionCookieName);
  // ถ้าไม่มี token ให้ตอบ 401 ทันที ไม่ต้องไปถามฐานข้อมูล
  if (!token) return c.json(apiError('unauthorized', 'Please log in'), 401);
  // หาผู้ใช้จาก token
  const user = await getSessionUser(token);
  // ถ้า session ไม่มีหรือหมดอายุ ให้ตอบ 401
  if (!user) return c.json(apiError('unauthorized', 'Session expired, please log in again'), 401);
  // ฝากข้อมูลผู้ใช้ไว้ให้ route ถัดไปใช้
  c.set('user', user);
  // ไปทำงานต่อที่ route ถัดไป
  await next();
});
