// ข้อมูลผู้ใช้ที่ gateway ส่งกลับมา
export type User = { id: number; username: string; role: 'user' | 'admin'; onboardedAt: string | null; createdAt: string };

// สถานะของลิงก์
export type LinkStatus = 'active' | 'locked' | 'disabled' | 'expired' | 'scheduled';

// ข้อมูลลิงก์หนึ่งรายการ
export type Link = {
  id: number;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  title: string | null;
  tags: string[];
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  status: LinkStatus;
  deletedAt: string | null;
  lockedAt: string | null;
  lockReason: string | null;
  createdAt: string;
  updatedAt: string;
};

// ลิงก์พร้อมยอดคลิก (null = analytics ยังไม่พร้อม)
export type LinkWithClicks = Link & { clicks: number | null };

// ผลลัพธ์ของหน้าประวัติ
export type LinkList = { items: LinkWithClicks[]; total: number; page: number; pageSize: number; analyticsAvailable: boolean };

// รายการนับแยกกลุ่ม
export type Breakdown = { name: string; count: number }[];

// สถิติของลิงก์หนึ่ง
export type LinkStats = {
  days: number;
  totalClicks: number;
  uniqueVisitors: number;
  lastClickAt: string | null;
  botClicks: number;
  daily: { date: string; clicks: number }[];
  devices: Breakdown;
  browsers: Breakdown;
  os: Breakdown;
  referers: Breakdown;
  countries: Breakdown;
  recent: { clickedAt: string; deviceType: string; browser: string | null; os: string | null; referer: string | null; country: string | null }[];
};

// สรุปภาพรวมของ dashboard
export type Summary = { totalLinks: number; activeLinks: number; totalClicks: number | null; topLinks: LinkWithClicks[]; analyticsAvailable: boolean };

// ภาพรวมของผู้ดูแล
export type AdminSummary = {
  users: number;
  suspendedUsers: number;
  links: number;
  lockedLinks: number;
  linksLast7Days: number;
  blockedDomains: number;
  totalClicks: number | null;
};

// ผู้ใช้ในหน้าผู้ดูแล
export type AdminUser = { id: number; username: string; role: 'user' | 'admin'; isActive: boolean; createdAt: string; linkCount: number };

// ลิงก์ในหน้าผู้ดูแล มีชื่อเจ้าของเพิ่ม
export type AdminLink = LinkWithClicks & { owner: string; ownerActive: boolean };

// รายการแบบแบ่งหน้า
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

// รายการ blocklist
export type BlockedDomain = { id: number; domain: string; reason: string | null; createdAt: string; createdBy: string | null };

// ปัญหาของแต่ละช่องกรอก
export type FieldError = { field: string; message: string };

// error จาก API เก็บรหัสสถานะ รหัส error และปัญหาของแต่ละช่อง (หน้าเว็บเป็นคนแปลข้อความจากรหัสเอง)
export class ApiError extends Error {
  // รหัสสถานะ HTTP
  status: number;
  // รหัส error ของระบบ เช่น alias_taken
  code: string;
  // ปัญหาของแต่ละช่องกรอก (ถ้ามี)
  fields: FieldError[];

  constructor(status: number, code: string, message: string, fields: FieldError[] = []) {
    // ข้อความจาก server เก็บไว้เป็นข้อความสำรอง
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  // หาข้อความ error ของช่องที่ระบุ
  fieldError(field: string): string | undefined {
    return this.fields.find((f) => f.field === field)?.message;
  }
}

// ชื่อ event ที่ส่งออกเมื่อ session หมดอายุ ให้ส่วนจัดการ login รับไปพาไปหน้า login
export const AUTH_EXPIRED_EVENT = 'auth:expired';

// เรียก API ของ gateway (path ต่อจาก /api) และแปลงผลเป็น JSON
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  // ตัวแปรเก็บ response
  let res: Response;
  try {
    // ส่ง request ไปที่โดเมนเดียวกัน browser จะแนบ cookie session ให้เอง
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
    });
  } catch {
    // เชื่อมต่อไม่ได้เลย
    throw new ApiError(0, 'network_error', 'Network error');
  }
  // 204 ไม่มีเนื้อหา
  if (res.status === 204) return undefined as T;
  // อ่าน JSON ถ้าอ่านไม่ได้ให้เป็น null
  const data = await res.json().catch(() => null);
  // ถ้าสำเร็จ คืนข้อมูล
  if (res.ok) return data as T;
  // ถ้า session หมดอายุระหว่างใช้งาน แจ้งให้ส่วนจัดการ login รู้ (ยกเว้นตอนเช็กสถานะครั้งแรก)
  if (res.status === 401 && path !== '/auth/me') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  // แยกข้อมูล error ที่ gateway ส่งมา
  const err = data?.error ?? {};
  // โยน error พร้อมรหัส
  throw new ApiError(res.status, err.code ?? 'unknown', err.message ?? 'Error', Array.isArray(err.details) ? err.details : []);
}
