// นำเข้าฟังก์ชันเทียบค่าแบบใช้เวลาคงที่ ป้องกันการเดา key จากเวลาที่ใช้เทียบ
import { timingSafeEqual } from 'node:crypto';
// นำเข้าตัวช่วยสร้าง middleware ของ Hono
import { createMiddleware } from 'hono/factory';

// ชื่อ header ที่ service ใช้ส่ง key ถึงกัน
export const INTERNAL_KEY_HEADER = 'x-internal-key';

// เทียบข้อความสองชุดแบบใช้เวลาคงที่
function safeEqual(a: string, b: string): boolean {
  // แปลงเป็น byte
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // ความยาวต่างกันแปลว่าไม่ตรงแน่นอน (timingSafeEqual ต้องการความยาวเท่ากัน)
  if (ba.length !== bb.length) return false;
  // เทียบทุก byte โดยใช้เวลาเท่ากันเสมอ
  return timingSafeEqual(ba, bb);
}

// middleware สำหรับ route ภายใน ให้เฉพาะ service ของเราที่รู้ key เรียกได้
export function requireInternalKey(getKey: () => string | undefined) {
  return createMiddleware(async (c, next) => {
    // อ่าน key ที่ตั้งไว้ใน environment ของ service นี้
    const expected = getKey();
    // อ่าน key ที่ผู้เรียกส่งมา
    const given = c.req.header(INTERNAL_KEY_HEADER);
    // ถ้าไม่ได้ตั้ง key ไว้ ให้ปฏิเสธทุกคำขอ (ปิดไว้ก่อนดีกว่าเปิดโดยไม่ตั้งใจ)
    if (!expected || !given || !safeEqual(given, expected)) {
      // ตอบ 401 โดยไม่บอกรายละเอียด
      return c.json({ error: { code: 'unauthorized', message: 'Invalid internal key' } }, 401);
    }
    // key ถูกต้อง ไปทำงานต่อ
    await next();
  });
}
