// นำเข้าตัวรัน Hono บน Node.js
import { serve } from '@hono/node-server';
// นำเข้า logger ที่ใช้ร่วมกันทุก service
import { createLogger } from '@synerry/shared';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from './app';
// นำเข้า connection pool เพื่อปิดตอนหยุด service
import { sql } from './db/client';

// สร้าง logger ของ service นี้
const log = createLogger('analytics');
// อ่านพอร์ตจาก environment ถ้าไม่มีใช้ 3003
const port = Number(process.env.PORT ?? 3003);

// เริ่มรันเซิร์ฟเวอร์ด้วย app ที่สร้างขึ้น
const server = serve({ fetch: createApp().fetch, port }, (info) => {
  // แสดง log เมื่อเซิร์ฟเวอร์พร้อมรับ request
  log.info('listening', { port: info.port });
});

// ปิดเซิร์ฟเวอร์และ connection ฐานข้อมูลอย่างเรียบร้อยเมื่อได้รับสัญญาณหยุด
const shutdown = async () => {
  // บันทึกว่ากำลังปิด service
  log.info('shutting down');
  // หยุดรับ request ใหม่
  server.close();
  // ปิด connection pool ของฐานข้อมูล
  await sql.end({ timeout: 5 });
  // จบการทำงานของ process
  process.exit(0);
};
// รับสัญญาณ Ctrl+C ตอนรันบนเครื่อง
process.on('SIGINT', shutdown);
// รับสัญญาณหยุดจากแพลตฟอร์ม เช่น Render ตอน deploy ใหม่
process.on('SIGTERM', shutdown);
