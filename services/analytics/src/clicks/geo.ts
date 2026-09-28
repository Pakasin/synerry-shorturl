// นำเข้าตัวตรวจรูปแบบ IP ของ Node.js
import { isIPv4, isIPv6 } from 'node:net';
// นำเข้าฐานข้อมูล IP -> ประเทศ (ข้อมูล GeoLite2 ของ MaxMind โหลดทีละส่วนเท่าที่ใช้ ประหยัดหน่วยความจำ)
import geoip from 'fast-geoip';

// ตรวจว่าเป็น IPv4 ภายใน (เครือข่ายบ้าน/บริษัท/เครื่องตัวเอง) ซึ่งไม่มีประเทศ
function isPrivateV4(ip: string): boolean {
  // แยกเป็นตัวเลข 4 ส่วน
  const [a, b] = ip.split('.').map(Number);
  return (
    // 10.0.0.0/8 เครือข่ายภายใน
    a === 10 ||
    // 127.0.0.0/8 เครื่องตัวเอง
    a === 127 ||
    // 0.0.0.0/8 ไม่ระบุ
    a === 0 ||
    // 169.254.0.0/16 link-local
    (a === 169 && b === 254) ||
    // 172.16.0.0/12 เครือข่ายภายใน
    (a === 172 && b >= 16 && b <= 31) ||
    // 192.168.0.0/16 เครือข่ายภายใน
    (a === 192 && b === 168) ||
    // 100.64.0.0/10 เครือข่ายของผู้ให้บริการ (CGNAT)
    (a === 100 && b >= 64 && b <= 127)
  );
}

// ตรวจว่าเป็น IP สาธารณะที่ควรหาประเทศได้
export function isPublicIp(ip: string): boolean {
  // IPv4 ที่ห่อมาในรูป IPv6 เช่น ::ffff:1.2.3.4 ให้ตัดส่วนหน้าออก
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  // เป็น IPv4 ให้ตรวจว่าไม่ใช่ภายใน
  if (isIPv4(v4)) return !isPrivateV4(v4);
  // เป็น IPv6 ให้ตัด ::1 (เครื่องตัวเอง), fc00::/7 (ภายใน), fe80::/10 (link-local)
  if (isIPv6(ip)) return !(ip === '::1' || /^f[cd]/i.test(ip) || /^fe[89ab]/i.test(ip));
  // ไม่ใช่ IP ที่ถูกต้อง
  return false;
}

// หาประเทศจาก IP คืนรหัส ISO 2 ตัว เช่น TH หรือ null ถ้าหาไม่ได้
export async function countryFromIp(ip: string | undefined): Promise<string | null> {
  // ไม่มี IP หรือเป็น IP ภายใน ไม่ต้องหา (ฐานข้อมูลอาจตอบประเทศผิดๆ สำหรับ IP ภายใน)
  if (!ip || !isPublicIp(ip)) return null;
  try {
    // ค้นในฐานข้อมูล
    const result = await geoip.lookup(ip.startsWith('::ffff:') ? ip.slice(7) : ip);
    // คืนรหัสประเทศถ้าเป็นรูปแบบ 2 ตัวอักษร
    return result?.country && /^[A-Z]{2}$/.test(result.country) ? result.country : null;
  } catch {
    // ค้นไม่ได้ ไม่ให้กระทบการบันทึกคลิก
    return null;
  }
}
