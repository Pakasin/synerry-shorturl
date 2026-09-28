// นำเข้าฟังก์ชัน hash จาก Node.js
import { createHash } from 'node:crypto';
// นำเข้าตัวแยกข้อมูล browser/OS/อุปกรณ์ จาก user agent (v1 ใช้สัญญาอนุญาต MIT)
import UAParser from 'ua-parser-js';
// นำเข้าค่าตั้งค่า
import { config } from '../config';

// รูปแบบชื่อของโปรแกรมอัตโนมัติ เช่น bot ของ search engine และตัวสร้าง preview ของแอปแชต
// เมื่อวางลิงก์ใน LINE หรือ Slack แอปจะเปิดลิงก์เองเพื่อทำ preview ถ้านับด้วยยอดคลิกจะเกินจริง
const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|curl|wget|python-requests|headless/i;

// ข้อมูลที่แยกได้จาก user agent
export type ParsedAgent = { deviceType: string; browser: string | null; os: string | null };

// แยกประเภทอุปกรณ์ browser และระบบปฏิบัติการ จาก user agent
export function parseUserAgent(userAgent: string | undefined): ParsedAgent {
  // ถ้าไม่มี user agent ให้ถือเป็นอื่นๆ
  if (!userAgent) return { deviceType: 'other', browser: null, os: null };
  // ถ้าตรงกับรูปแบบ bot ให้ติดป้าย bot เพื่อไม่นับในสถิติ
  if (BOT_PATTERN.test(userAgent)) return { deviceType: 'bot', browser: null, os: null };
  // ให้ ua-parser แยกข้อมูล
  const result = new UAParser(userAgent).getResult();
  // ua-parser บอก mobile หรือ tablet ถ้าไม่บอกอะไรเลยส่วนใหญ่คือคอมพิวเตอร์
  const type = result.device.type;
  // จัดกลุ่มประเภทอุปกรณ์ให้เหลือ 4 แบบ
  const deviceType = type === 'mobile' || type === 'tablet' ? type : type ? 'other' : 'desktop';
  // คืนข้อมูล โดยตัดความยาวให้พอดีกับคอลัมน์ในฐานข้อมูล
  return {
    deviceType,
    browser: result.browser.name?.slice(0, 50) ?? null,
    os: result.os.name?.slice(0, 50) ?? null,
  };
}

// hash IP พร้อม salt เพื่อนับผู้เข้าชมไม่ซ้ำได้โดยไม่เก็บ IP จริง
export function hashIp(ip: string | undefined): string | null {
  // ถ้าไม่มี IP ไม่ต้อง hash
  if (!ip) return null;
  // ผสม salt แล้ว hash ด้วย sha256 ได้ข้อความยาว 64 ตัว
  return createHash('sha256').update(`${config.ipHashSalt}:${ip}`).digest('hex');
}
