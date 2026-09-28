// นำเข้าตัวช่วยสร้าง middleware
import { createMiddleware } from 'hono/factory';
// นำเข้าชนิดข้อมูลของ context และตัวช่วยสร้าง error
import { apiError, type AppEnv } from '../types';

// middleware ให้เฉพาะผู้ดูแลระบบผ่าน ต้องวางหลัง requireAuth
// ผู้ใช้ทั่วไปได้ 404 เหมือนไม่มี route นี้ เพื่อไม่บอกว่ามีหน้าผู้ดูแลอยู่
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  // ตรวจบทบาทของผู้ใช้ที่ login อยู่
  if (c.get('user').role !== 'admin') return c.json(apiError('not_found', 'Route not found'), 404);
  // เป็นผู้ดูแล ไปทำงานต่อ
  await next();
});
