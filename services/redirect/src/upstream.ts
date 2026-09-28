// นำเข้าชื่อ header ของ key ภายใน
import { INTERNAL_KEY_HEADER } from '@synerry/shared';
// นำเข้าค่าตั้งค่า
import { config } from './config';

// ข้อมูลลิงก์ที่ gateway ส่งกลับมา
export type LinkInfo = { id: number; originalUrl: string; isActive: boolean; startsAt: string | null; expiresAt: string | null; blocked: boolean };

// ผลการค้นลิงก์ แยก 3 กรณี: เจอ, ไม่มีลิงก์นี้, และค้นไม่ได้ (gateway ล่มหรือช้า)
export type LookupResult = { kind: 'found'; link: LinkInfo } | { kind: 'not_found' } | { kind: 'unavailable'; reason: string };

// header ที่ใช้ทุกครั้งที่เรียก service อื่น
const internalHeaders = () => ({ [INTERNAL_KEY_HEADER]: config.internalApiKey, 'content-type': 'application/json' });

// ค้นลิงก์จากรหัสสั้นผ่าน gateway
export async function lookupLink(code: string): Promise<LookupResult> {
  try {
    // เรียก gateway โดยกำหนดเวลารอสูงสุด (encode รหัสเพื่อความปลอดภัยของ path)
    const res = await fetch(`${config.gatewayUrl}/internal/links/${encodeURIComponent(code)}`, {
      headers: internalHeaders(),
      signal: AbortSignal.timeout(config.lookupTimeoutMs),
    });
    // gateway ยืนยันว่าไม่มีลิงก์นี้
    if (res.status === 404) return { kind: 'not_found' };
    // gateway ตอบ error อื่น ถือว่าค้นไม่ได้ ไม่ใช่ไม่มีลิงก์
    if (!res.ok) return { kind: 'unavailable', reason: `gateway HTTP ${res.status}` };
    // เจอลิงก์
    return { kind: 'found', link: (await res.json()) as LinkInfo };
  } catch (err) {
    // เชื่อมต่อไม่ได้ หรือหมดเวลารอ
    return { kind: 'unavailable', reason: (err as Error).message };
  }
}

// ข้อมูลการคลิกที่ส่งให้ analytics
export type ClickEvent = { linkId: number; clickedAt: string; ip?: string; userAgent?: string; referer?: string };

// ส่งการคลิกให้ analytics บันทึก คืน true ถ้าบันทึกสำเร็จ ห้ามโยน error ออกไปเด็ดขาด
export async function recordClick(event: ClickEvent): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    // ส่งข้อมูลโดยกำหนดเวลารอสูงสุด ถ้า analytics ช้าหรือหลับอยู่ จะยกเลิกเมื่อครบเวลา
    const res = await fetch(`${config.analyticsUrl}/internal/clicks`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(config.clickTimeoutMs),
    });
    // analytics ตอบ error
    if (!res.ok) return { ok: false, reason: `analytics HTTP ${res.status}` };
    // บันทึกสำเร็จ
    return { ok: true };
  } catch (err) {
    // เชื่อมต่อไม่ได้ หรือหมดเวลารอ
    return { ok: false, reason: (err as Error).message };
  }
}
