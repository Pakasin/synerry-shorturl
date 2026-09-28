// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง blocked_domains
import { blockedDomains } from '../db/schema';

// โดเมนที่ติดมากับระบบ (ผู้ดูแลลบไม่ได้ เพื่อให้มีการป้องกันขั้นต่ำเสมอ)
// กลุ่มแรกเป็นบริการย่อลิงก์อื่น: การย่อลิงก์สั้นซ้อนกันหลายชั้นเป็นวิธีที่ใช้ซ่อนปลายทางจริงของลิงก์หลอกลวง
// กลุ่มที่สองเป็นโดเมนตัวอย่างสำหรับทดสอบ (สงวนไว้ตาม RFC 2606 ไม่มีเว็บจริง) ใช้สาธิตและใช้ใน test
export const BUILT_IN_BLOCKED = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly',
  'rebrand.ly', 'tiny.cc', 'shorturl.at', 'rb.gy', 'v.gd',
  'phishing.example', 'malware.example',
];

// รายการคงที่ = รายการในโค้ด + รายการเพิ่มเติมจาก environment (คั่นด้วย ,)
const staticBlocked = new Set(
  [...BUILT_IN_BLOCKED, ...(process.env.BLOCKED_DOMAINS ?? '').split(',')]
    // ตัดช่องว่างและแปลงเป็นตัวเล็ก
    .map((d) => d.trim().toLowerCase())
    // ตัดรายการว่างทิ้ง
    .filter(Boolean),
);

// รายการที่ผู้ดูแลเพิ่มจากหน้าเว็บ เก็บสำเนาไว้ในหน่วยความจำ จะได้ไม่ต้องถามฐานข้อมูลทุกครั้งที่ตรวจ URL
let dbBlocked = new Set<string>();

// โหลดรายการจากฐานข้อมูลเข้าหน่วยความจำ เรียกตอนเปิด service และทุกครั้งที่ผู้ดูแลเพิ่มหรือลบรายการ
export async function refreshBlocklist(): Promise<void> {
  // อ่านชื่อโดเมนทั้งหมด
  const rows = await db.select({ domain: blockedDomains.domain }).from(blockedDomains);
  // แทนที่ชุดเดิมทั้งชุด
  dbBlocked = new Set(rows.map((r) => r.domain));
}

// แปลงชื่อโดเมนให้เป็นรูปแบบเดียวกัน: ตัวเล็ก และตัดจุดท้ายชื่อ (www.bit.ly. คือโดเมนเดียวกับ www.bit.ly)
export const normalizeDomain = (host: string) => host.trim().toLowerCase().replace(/\.$/, '');

// ตรวจว่าชื่อโดเมนถูกบล็อกหรือไม่ รวมถึง subdomain ด้วย เช่น x.bit.ly ก็นับว่าถูกบล็อก
export function isBlockedHost(hostname: string): boolean {
  // แปลงรูปแบบ แล้วแยกเป็นส่วนๆ ด้วยจุด
  const parts = normalizeDomain(hostname).split('.');
  // ไล่ตรวจตั้งแต่ชื่อเต็มไปจนถึงโดเมนหลัก เช่น a.b.bit.ly -> b.bit.ly -> bit.ly
  for (let i = 0; i < parts.length - 1; i++) {
    // ชื่อที่กำลังตรวจ
    const candidate = parts.slice(i).join('.');
    // ถ้าอยู่ในรายการใดรายการหนึ่ง ถือว่าถูกบล็อก
    if (staticBlocked.has(candidate) || dbBlocked.has(candidate)) return true;
  }
  // ไม่ตรงเลย
  return false;
}

// ตรวจ URL เต็ม คืน true ถ้าปลายทางถูกบล็อก (URL ที่อ่านไม่ได้ถือว่าบล็อกไว้ก่อน)
export function isBlockedUrl(url: string): boolean {
  try {
    // แยกชื่อโดเมนแล้วตรวจ
    return isBlockedHost(new URL(url).hostname);
  } catch {
    // อ่าน URL ไม่ได้
    return true;
  }
}
