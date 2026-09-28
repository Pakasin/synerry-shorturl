// นำเข้า Hono สำหรับสร้าง web app
import { Hono } from 'hono';
// นำเข้าตัวช่วยที่ใช้ร่วมกันทุก service
import { buildHealth, createLogger } from '@synerry/shared';
// นำเข้าฟังก์ชันตรวจสุขภาพฐานข้อมูล
import { pingDb } from './db/client';
// นำเข้า route ภายใน
import { internalRoutes } from './routes/internal';

// สร้าง logger ของ analytics
const log = createLogger('analytics');

// สร้าง app แยกจากการเปิด server เพื่อให้ test เรียกใช้ได้โดยไม่ต้องเปิด port
export function createApp() {
  // สร้าง Hono app
  const app = new Hono();

  // endpoint ตรวจสุขภาพ ใช้กับ warm-up script และ health check ของ Render
  app.get('/health', async (c) => {
    // ตรวจการเชื่อมต่อฐานข้อมูลของ analytics
    const dbUp = await pingDb();
    // ตอบ 200 ถ้าปกติ หรือ 503 ถ้าฐานข้อมูลล่ม
    return c.json(buildHealth('analytics', dbUp ? 'up' : 'down'), dbUp ? 200 : 503);
  });

  // ผูก route ภายในไว้ที่ /internal
  app.route('/internal', internalRoutes());

  // path ที่ไม่มีอยู่จริง ตอบ 404 เป็น JSON
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404));

  // error ที่ไม่ได้ดักไว้ บันทึก log แล้วตอบ 500
  app.onError((err, c) => {
    // บันทึกรายละเอียดไว้ดูฝั่ง server
    log.error('unhandled error', { path: c.req.path, message: err.message });
    // ตอบข้อความกลางๆ
    return c.json({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500);
  });

  // คืน app ที่ตั้งค่าเสร็จแล้ว
  return app;
}
