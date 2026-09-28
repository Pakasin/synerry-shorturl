// นำเข้าชื่อ header ของ key ภายใน และ logger
import { createLogger, INTERNAL_KEY_HEADER } from '@synerry/shared';
// นำเข้าค่าตั้งค่า
import { config } from '../config';

// สร้าง logger ของ gateway
const log = createLogger('gateway');

// เรียก analytics service แบบมีเวลารอสูงสุด ถ้าล้มเหลวหรือช้าเกินจะคืน null แทนการโยน error
// เหตุผล: analytics ล่มต้องไม่ทำให้หน้าประวัติหรือการลบลิงก์ใช้งานไม่ได้ไปด้วย
async function callAnalytics<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    // ส่ง request พร้อม key ภายใน และตั้งเวลายกเลิกอัตโนมัติ
    const res = await fetch(`${config.analyticsUrl}${path}`, {
      method,
      headers: { [INTERNAL_KEY_HEADER]: config.internalApiKey ?? '', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.analyticsTimeoutMs),
    });
    // ถ้า analytics ตอบ error ให้บันทึกแล้วคืน null
    if (!res.ok) {
      log.warn('analytics responded with an error', { path, status: res.status });
      return null;
    }
    // คืนข้อมูลที่ได้
    return (await res.json()) as T;
  } catch (err) {
    // เชื่อมต่อไม่ได้ หรือหมดเวลารอ ให้บันทึกแล้วคืน null
    log.warn('analytics unavailable', { path, message: (err as Error).message });
    return null;
  }
}

// ข้อมูลสถิติที่ analytics ส่งกลับมา (ส่งต่อให้ frontend ตามรูปเดิม)
export type LinkStats = Record<string, unknown> & { totalClicks: number };

// ยอดคลิกของหลายลิงก์: counts ใช้รหัสลิงก์เป็น key
export type ClickCounts = { counts: Record<string, number>; totalClicks: number };

// ขอยอดคลิกของหลายลิงก์ในครั้งเดียว คืน null ถ้า analytics ไม่พร้อม
export function getClickCounts(linkIds: number[]): Promise<ClickCounts | null> {
  // ถ้าไม่มีลิงก์ ไม่ต้องเรียก
  if (linkIds.length === 0) return Promise.resolve({ counts: {}, totalClicks: 0 });
  // เรียก analytics
  return callAnalytics<ClickCounts>('POST', '/internal/stats/summary', { linkIds });
}

// ขอสถิติเต็มของลิงก์หนึ่ง คืน null ถ้า analytics ไม่พร้อม
export function getLinkStats(linkId: number, days: number) {
  return callAnalytics<LinkStats>('GET', `/internal/stats/${linkId}?days=${days}`);
}

// ลบคลิกทั้งหมดของลิงก์ คืน null ถ้า analytics ไม่พร้อม
export function deleteLinkClicks(linkId: number) {
  return callAnalytics<{ deleted: number }>('DELETE', `/internal/clicks/${linkId}`);
}
