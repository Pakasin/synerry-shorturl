// นำเข้า Hono และชนิดข้อมูลของ context
import { Hono, type Context } from 'hono';
// นำเข้าตัวอ่าน IP ของผู้เชื่อมต่อบน Node.js
import { getConnInfo } from '@hono/node-server/conninfo';
// นำเข้าตัวช่วยที่ใช้ร่วมกันทุก service
import { buildHealth, createLogger } from '@synerry/shared';
// นำเข้าค่าตั้งค่า
import { config } from './config';
// นำเข้าตัวค้นลิงก์และตัวบันทึกคลิก
import { lookupLink, recordClick } from './upstream';
// นำเข้าตัวสร้างหน้า error
import { renderPage, type PageKind } from './pages';

// สร้าง logger ของ redirect
const log = createLogger('redirect');

// รูปแบบรหัสสั้นที่เป็นไปได้ (ตรงกับกฎของ gateway) ถ้าไม่ตรงไม่ต้องไปถาม gateway เลย
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,30}$/;

// หา IP ของผู้คลิก
function clientIp(c: Context): string | undefined {
  // บน Render ผู้ใช้เชื่อมต่อผ่าน proxy ซึ่งใส่ IP จริงไว้ใน x-forwarded-for โดยค่าแรกคือต้นทาง
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  // ถ้ามีให้ใช้ค่านั้น
  if (forwarded) return forwarded;
  try {
    // ถ้าไม่มี proxy (รันบนเครื่อง) ใช้ IP ของการเชื่อมต่อโดยตรง
    return getConnInfo(c).remote.address;
  } catch {
    // ตอนรัน test ไม่มีการเชื่อมต่อจริง จึงไม่มี IP
    return undefined;
  }
}

// ตอบหน้า error พร้อมรหัสสถานะ และห้าม cache เพื่อให้เปิดลิงก์ใหม่ได้ทันทีเมื่อเจ้าของแก้ไข
function errorPage(c: Context, kind: PageKind, status: 403 | 404 | 410 | 503) {
  // ห้าม browser และ proxy เก็บหน้านี้ไว้
  c.header('Cache-Control', 'no-store');
  // ตอบ HTML
  return c.html(renderPage(kind), status);
}

// สร้าง app แยกจากการเปิด server เพื่อให้ test เรียกใช้ได้
export function createApp() {
  // สร้าง Hono app
  const app = new Hono();

  // endpoint ตรวจสุขภาพ service นี้ไม่มีฐานข้อมูลของตัวเอง
  app.get('/health', (c) => c.json(buildHealth('redirect', 'none')));

  // เปิดโดเมนลิงก์สั้นเปล่าๆ ให้พาไปหน้าเว็บหลัก
  app.get('/', (c) => c.redirect(config.appUrl, 302));

  // หัวใจของระบบ: เปิดลิงก์สั้นแล้วพาไป URL ต้นฉบับ
  app.get('/:code', async (c) => {
    // รหัสจาก path
    const code = c.req.param('code');
    // รูปแบบไม่ถูกต้อง (เช่น favicon.ico) ตอบหน้าไม่พบทันที ไม่เปลืองการเรียก gateway
    if (!CODE_PATTERN.test(code)) return errorPage(c, 'not_found', 404);

    // 1) ค้นลิงก์จาก gateway
    const result = await lookupLink(code);
    // ไม่มีลิงก์นี้
    if (result.kind === 'not_found') return errorPage(c, 'not_found', 404);
    // ค้นไม่ได้ (gateway ล่มหรือช้า) ตอบ 503 ไม่ใช่ 404 เพราะลิงก์อาจมีอยู่จริง
    if (result.kind === 'unavailable') {
      // บันทึกเหตุผลไว้ดูฝั่ง server
      log.error('lookup failed', { code, reason: result.reason });
      // ตอบหน้าให้ลองใหม่
      return errorPage(c, 'unavailable', 503);
    }
    // ข้อมูลลิงก์ที่เจอ
    const link = result.link;
    // เจ้าของปิดลิงก์ไว้ ตอบ 410 (เคยมีแต่ใช้ไม่ได้แล้ว)
    if (!link.isActive) return errorPage(c, 'disabled', 410);
    // เลยวันหมดอายุแล้ว ตอบ 410
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return errorPage(c, 'expired', 410);
    // ยังไม่ถึงวันเริ่มใช้งาน ตอบ 403 (มีลิงก์นี้อยู่ แต่ยังไม่อนุญาตให้เข้า)
    if (link.startsAt && new Date(link.startsAt).getTime() > Date.now()) return errorPage(c, 'scheduled', 403);
    // ปลายทางอยู่ในรายการบล็อก ตอบ 410 และไม่พาไปเด็ดขาด
    if (link.blocked) return errorPage(c, 'blocked', 410);
    // ตรวจซ้ำอีกชั้นว่าปลายทางเป็น http/https เท่านั้น เผื่อข้อมูลในฐานข้อมูลถูกแก้จากช่องทางอื่น
    if (!/^https?:\/\//i.test(link.originalUrl)) return errorPage(c, 'not_found', 404);

    // 2) บันทึกคลิกก่อนตอบ (HEAD คือการเช็กลิงก์โดยโปรแกรม ไม่ใช่คนคลิก จึงไม่นับ)
    if (c.req.method === 'GET') {
      // รอผลการบันทึก แต่ไม่เกินเวลาที่กำหนด และ recordClick ไม่มีวันโยน error
      const saved = await recordClick({
        // รหัสลิงก์
        linkId: link.id,
        // เวลาที่คลิกจริง (ไม่ใช่เวลาที่ analytics ได้รับ)
        clickedAt: new Date().toISOString(),
        // IP ของผู้คลิก analytics จะ hash ก่อนเก็บ
        ip: clientIp(c),
        // ข้อมูล browser
        userAgent: c.req.header('user-agent'),
        // หน้าที่ส่งผู้ใช้มา
        referer: c.req.header('referer'),
      });
      // ถ้าบันทึกไม่สำเร็จ บันทึก log ไว้ แต่ยังพาผู้ใช้ไปต่อตามปกติ
      if (!saved.ok) log.warn('click not recorded', { code, linkId: link.id, reason: saved.reason });
    }

    // 3) พาไป URL ต้นฉบับ ห้าม cache เพื่อให้ทุกคลิกผ่านมาที่เรา (นับได้ครบ และปิดลิงก์แล้วมีผลทันที)
    c.header('Cache-Control', 'no-store');
    // ตอบ 302 พร้อมปลายทาง
    return c.redirect(link.originalUrl, 302);
  });

  // path อื่นที่ไม่รู้จัก (เช่น มี / หลายชั้น) ตอบหน้าไม่พบ
  app.notFound((c) => errorPage(c, 'not_found', 404));

  // error ที่ไม่ได้ดักไว้ ตอบหน้าให้ลองใหม่
  app.onError((err, c) => {
    // บันทึกรายละเอียด
    log.error('unhandled error', { path: c.req.path, message: err.message });
    // ตอบหน้าให้ลองใหม่
    return errorPage(c, 'unavailable', 503);
  });

  // คืน app ที่ตั้งค่าเสร็จแล้ว
  return app;
}
