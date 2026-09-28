// นำเข้าตัวช่วยสร้าง middleware
import { createMiddleware } from 'hono/factory';
// นำเข้าค่าตั้งค่า
import { config } from '../config';
// นำเข้าตัวช่วยสร้าง error
import { apiError } from '../types';

// method ที่อ่านข้อมูลอย่างเดียว ไม่ต้องตรวจ origin
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// กัน CSRF: request ที่แก้ไขข้อมูลต้องมาจากหน้าเว็บของเราเท่านั้น
export const originCheck = createMiddleware(async (c, next) => {
  // ถ้าเป็น method ที่ปลอดภัย ให้ผ่านไปเลย
  if (SAFE_METHODS.has(c.req.method)) return next();
  // browser จะแนบ header Origin มาเสมอกับ POST PATCH DELETE
  const origin = c.req.header('origin');
  // ถ้ามี Origin แต่ไม่อยู่ในรายชื่อที่อนุญาต แปลว่ามาจากเว็บอื่น ให้ปฏิเสธ
  if (origin && !config.allowedOrigins.includes(origin)) {
    // ตอบ 403 พร้อมเหตุผล
    return c.json(apiError('forbidden_origin', 'Request origin is not allowed'), 403);
  }
  // ถ้าไม่มี Origin แปลว่าไม่ใช่ browser (เช่น curl) ซึ่งไม่มี cookie ของผู้ใช้ติดมา จึงไม่เสี่ยง CSRF
  await next();
});
