// นำเข้าตัวรัน Hono บน Node.js
import { serve } from '@hono/node-server';
// นำเข้า logger ที่ใช้ร่วมกันทุก service
import { createLogger } from '@synerry/shared';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from './app';

// สร้าง logger ของ service นี้
const log = createLogger('redirect');
// อ่านพอร์ตจาก environment ถ้าไม่มีใช้ 3002
const port = Number(process.env.PORT ?? 3002);

// เริ่มรันเซิร์ฟเวอร์ด้วย app ที่สร้างขึ้น
const server = serve({ fetch: createApp().fetch, port }, (info) => {
  // แสดง log เมื่อเซิร์ฟเวอร์พร้อมรับ request
  log.info('listening', { port: info.port });
});

// ปิดเซิร์ฟเวอร์อย่างเรียบร้อยเมื่อได้รับสัญญาณหยุด
const shutdown = () => {
  // บันทึกว่ากำลังปิด service
  log.info('shutting down');
  // หยุดรับ request ใหม่ รอ request ที่ค้างอยู่ (รวมถึงการบันทึกคลิก) ให้เสร็จ แล้วจบ process
  server.close(() => process.exit(0));
};
// รับสัญญาณ Ctrl+C ตอนรันบนเครื่อง
process.on('SIGINT', shutdown);
// รับสัญญาณหยุดจากแพลตฟอร์ม เช่น Render ตอน deploy ใหม่
process.on('SIGTERM', shutdown);
