// นำเข้าตัวสร้าง HTML ของ Hono ซึ่ง escape ค่าที่ใส่เข้าไปให้อัตโนมัติ กัน XSS
import { html } from 'hono/html';
// นำเข้าค่าตั้งค่าเพื่อทำปุ่มกลับหน้าหลัก
import { config } from './config';

// ประเภทของหน้าที่แสดงเมื่อพาไปปลายทางไม่ได้
export type PageKind = 'not_found' | 'disabled' | 'expired' | 'scheduled' | 'blocked' | 'unavailable';

// ข้อความของแต่ละหน้า มีทั้งภาษาไทยและอังกฤษ
const TEXT: Record<PageKind, { title: string; th: string; en: string }> = {
  // ไม่มีลิงก์นี้ในระบบ
  not_found: { title: 'Link not found', th: 'ไม่พบลิงก์นี้ กรุณาตรวจสอบว่าพิมพ์ลิงก์ถูกต้อง', en: 'This short link does not exist. Please check the address.' },
  // เจ้าของปิดลิงก์ไว้
  disabled: { title: 'Link disabled', th: 'ลิงก์นี้ถูกปิดการใช้งานโดยเจ้าของ', en: 'This short link has been disabled by its owner.' },
  // ลิงก์หมดอายุแล้ว
  expired: { title: 'Link expired', th: 'ลิงก์นี้หมดอายุแล้ว', en: 'This short link has expired.' },
  // ยังไม่ถึงวันเริ่มใช้งาน
  scheduled: { title: 'Link not active yet', th: 'ลิงก์นี้ยังไม่เปิดใช้งาน กรุณากลับมาใหม่ตามวันเวลาที่ได้รับแจ้ง', en: 'This short link is not active yet. Please come back later.' },
  // ปลายทางอยู่ในรายการเว็บที่ไม่ปลอดภัย
  blocked: { title: 'Link blocked', th: 'ลิงก์นี้ถูกระงับ เพราะปลายทางอยู่ในรายการเว็บไซต์ที่ไม่อนุญาต', en: 'This short link has been blocked because its destination is not allowed.' },
  // ระบบค้นลิงก์ไม่ได้ชั่วคราว
  unavailable: { title: 'Please try again', th: 'ระบบไม่ว่างชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่', en: 'The service is temporarily unavailable. Please try again in a moment.' },
};

// สร้างหน้า HTML ตามประเภท ใช้สีและชื่อของ Synerry
export function renderPage(kind: PageKind) {
  // ข้อความของหน้านี้
  const t = TEXT[kind];
  // คืน HTML ทั้งหน้า (ใส่ CSS ไว้ในหน้าเลย เพื่อไม่ต้องโหลดไฟล์อื่น)
  return html`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t.title} | Synerry Short URL</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f6f8; color: #1b2340;
         font-family: system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", sans-serif; padding: 16px; box-sizing: border-box; }
  .card { max-width: 440px; width: 100%; background: #fff; border-radius: 16px; padding: 32px;
          box-shadow: 0 8px 30px rgba(27, 35, 64, .08); text-align: center; border-top: 4px solid #e31e24; }
  .brand { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 24px; color: #1b2340; font-weight: 600; }
  .brand img { height: 36px; width: auto; }
  .brand i { width: 1px; height: 24px; background: #1b2340; opacity: .25; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { margin: 6px 0; line-height: 1.6; }
  .en { color: #6b7280; font-size: 14px; }
  a { display: inline-block; margin-top: 24px; padding: 10px 20px; border-radius: 10px; background: #e31e24;
      color: #fff; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
  <main class="card">
    <!-- โลโก้ Synerry โหลดจากหน้าเว็บหลัก ตามด้วยชื่อบริการ -->
    <div class="brand"><img src="${config.appUrl}/synerry-logo.png" alt="Synerry"><i></i>Short URL</div>
    <h1>${t.title}</h1>
    <p>${t.th}</p>
    <p class="en">${t.en}</p>
    <a href="${config.appUrl}">สร้างลิงก์สั้นของคุณ / Create your own short link</a>
  </main>
</body>
</html>`;
}
