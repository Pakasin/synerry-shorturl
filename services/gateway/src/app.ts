// นำเข้า Hono สำหรับสร้าง web app
import { Hono } from 'hono';
// นำเข้าตัวช่วยที่ใช้ร่วมกันทุก service
import { buildHealth, createLogger } from '@synerry/shared';
// นำเข้าฟังก์ชันตรวจสุขภาพฐานข้อมูล
import { pingDb } from './db/client';
// นำเข้า middleware กัน CSRF
import { originCheck } from './middleware/originCheck';
// นำเข้ากลุ่ม route ของระบบสมาชิก
import { authRoutes } from './routes/auth';
// นำเข้ากลุ่ม route ของการจัดการลิงก์
import { linkRoutes } from './routes/links';
// นำเข้ากลุ่ม route สรุปภาพรวม
import { statsRoutes } from './routes/stats';
// นำเข้ากลุ่ม route ของผู้ดูแลระบบ
import { adminRoutes } from './routes/admin';
// นำเข้ากลุ่ม route ภายในสำหรับ service อื่น
import { internalRoutes } from './routes/internal';
// นำเข้าชนิดข้อมูลและตัวช่วยสร้าง error
import { apiError, type AppEnv } from './types';
// นำเข้า middleware ใส่ header ความปลอดภัย
import { secureHeaders } from 'hono/secure-headers';
// นำเข้าตัวผูกการเสิร์ฟหน้าเว็บ
import { mountFrontend } from './frontend';

// สร้าง logger ของ gateway
const log = createLogger('gateway');

// สร้าง app ใหม่ทุกครั้งที่เรียก แยกจากการเปิด server เพื่อให้ test เรียกใช้ได้โดยไม่ต้องเปิด port
export function createApp() {
  // สร้าง Hono app พร้อมชนิดข้อมูลของ context
  const app = new Hono<AppEnv>();

  // ใส่ header ความปลอดภัยให้ทุก response
  app.use(
    '*',
    secureHeaders({
      // จำกัดว่าหน้าเว็บโหลดอะไรได้บ้าง ถ้ามีสคริปต์แปลกปลอมถูกฝังเข้ามาก็รันไม่ได้ (ลดความเสียหายจาก XSS)
      contentSecurityPolicy: {
        // ค่าเริ่มต้น: โหลดได้จากโดเมนตัวเองเท่านั้น
        defaultSrc: ["'self'"],
        // สคริปต์: เฉพาะไฟล์ของเราเอง ห้ามสคริปต์ inline
        scriptSrc: ["'self'"],
        // style: อนุญาต inline เพราะไลบรารีกราฟใส่ style ให้แต่ละจุดเอง
        styleSrc: ["'self'", "'unsafe-inline'"],
        // รูป: รวม data: และ blob: สำหรับรูป QR ที่สร้างในหน้าเว็บและตอนดาวน์โหลด
        imgSrc: ["'self'", 'data:', 'blob:'],
        // การเรียก API: โดเมนตัวเองเท่านั้น
        connectSrc: ["'self'"],
        // ห้ามเว็บอื่นเอาหน้าเราไปใส่ใน iframe (กัน clickjacking)
        frameAncestors: ["'none'"],
        // ห้ามเปลี่ยน base URL ของหน้า
        baseUri: ["'self'"],
        // ฟอร์มส่งข้อมูลได้เฉพาะโดเมนตัวเอง
        formAction: ["'self'"],
      },
    }),
  );

  // endpoint ตรวจสุขภาพ ใช้กับ warm-up script และ health check ของ Render
  app.get('/health', async (c) => {
    // ตรวจการเชื่อมต่อฐานข้อมูลของ gateway
    const dbUp = await pingDb();
    // ตอบ 200 ถ้าปกติ หรือ 503 ถ้าฐานข้อมูลล่ม
    return c.json(buildHealth('gateway', dbUp ? 'up' : 'down'), dbUp ? 200 : 503);
  });

  // ตรวจ origin ของทุก request ใต้ /api ก่อนเข้าถึง route
  app.use('/api/*', originCheck);
  // ผูกกลุ่ม route ของระบบสมาชิกไว้ที่ /api/auth
  app.route('/api/auth', authRoutes());
  // ผูกกลุ่ม route ของการจัดการลิงก์ไว้ที่ /api/links
  app.route('/api/links', linkRoutes());
  // ผูกกลุ่ม route สรุปภาพรวมไว้ที่ /api/stats
  app.route('/api/stats', statsRoutes());
  // ผูกกลุ่ม route ของผู้ดูแลระบบไว้ที่ /api/admin
  app.route('/api/admin', adminRoutes());
  // ผูกกลุ่ม route ภายในสำหรับ service อื่น ไว้ที่ /internal (อยู่นอก /api จึงไม่ผ่าน originCheck)
  app.route('/internal', internalRoutes());
  // เสิร์ฟหน้าเว็บ React ที่ build แล้ว (ถ้ามี) ต้องอยู่หลัง route ของ API ทั้งหมด
  mountFrontend(app);

  // path ใต้ /api ที่ไม่มีอยู่จริง ตอบ 404 เป็น JSON
  app.notFound((c) => c.json(apiError('not_found', 'Route not found'), 404));

  // error ที่ไม่ได้ดักไว้ บันทึก log แล้วตอบ 500 โดยไม่เปิดเผยรายละเอียดภายใน
  app.onError((err, c) => {
    // บันทึกรายละเอียดไว้ดูฝั่ง server
    log.error('unhandled error', { path: c.req.path, message: err.message });
    // ตอบข้อความกลางๆ ให้ผู้ใช้
    return c.json(apiError('internal_error', 'Something went wrong'), 500);
  });

  // คืน app ที่ตั้งค่าเสร็จแล้ว
  return app;
}
