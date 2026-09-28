// นำเข้าตัวช่วยสร้าง middleware
import { createMiddleware } from 'hono/factory';
// นำเข้าตัวช่วยสร้าง error
import { apiError } from '../types';

// สร้าง middleware จำกัดจำนวนครั้งต่อ IP ภายในช่วงเวลาหนึ่ง
export function rateLimit(opts: { max: number; windowMs: number }) {
  // เก็บจำนวนครั้งและเวลารีเซ็ตของแต่ละ IP ไว้ในหน่วยความจำ
  // (พอสำหรับ service ตัวเดียว ถ้าขยายหลายเครื่องต้องย้ายไปเก็บที่ Redis)
  const hits = new Map<string, { count: number; resetAt: number }>();

  return createMiddleware(async (c, next) => {
    // Render ส่ง IP จริงของผู้ใช้มาใน x-forwarded-for โดยค่าแรกคือ IP ต้นทาง
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    // เวลาปัจจุบัน
    const now = Date.now();
    // ดึงข้อมูลเดิมของ IP นี้
    const entry = hits.get(ip);
    // ถ้ายังไม่เคยมีหรือหมดช่วงเวลาแล้ว ให้เริ่มนับใหม่
    if (!entry || entry.resetAt <= now) {
      // เริ่มนับครั้งแรก และกำหนดเวลารีเซ็ต
      hits.set(ip, { count: 1, resetAt: now + opts.windowMs });
      // ผ่านไปทำงานต่อ
      return next();
    }
    // ถ้าเกินจำนวนที่กำหนด ให้ตอบ 429
    if (entry.count >= opts.max) {
      // บอก browser ว่าต้องรออีกกี่วินาที
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      // ตอบ error
      return c.json(apiError('rate_limited', 'Too many attempts, please try again later'), 429);
    }
    // ยังไม่เกิน ให้นับเพิ่มหนึ่งครั้ง
    entry.count += 1;
    // ผ่านไปทำงานต่อ
    await next();
  });
}
