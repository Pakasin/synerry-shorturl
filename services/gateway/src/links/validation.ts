// นำเข้า zod สำหรับตรวจข้อมูล
import { z } from 'zod';
// นำเข้าค่าตั้งค่าเพื่อรู้โดเมนของลิงก์สั้นเอง
import { config } from '../config';
// นำเข้าตัวตรวจโดเมนที่ถูกบล็อก
import { isBlockedHost } from './blocklist';

// คำที่ห้ามใช้เป็น alias เพราะชนกับ path ของระบบ หรืออาจทำให้ผู้ใช้เข้าใจผิด
export const RESERVED_ALIASES = new Set([
  'api', 'internal', 'health', 'admin', 'login', 'logout', 'register', 'trash',
  'dashboard', 'history', 'links', 'settings', 'static', 'assets', 'favicon.ico', 'robots.txt',
]);

// ตรวจ URL ต้นฉบับ แล้วแปลงเป็นรูปแบบมาตรฐาน (เช่น HTTPS://WWW.Synerry.com -> https://www.synerry.com/)
// รูปแบบมาตรฐานทำให้ตรวจ URL ซ้ำได้แม่นยำ
export const originalUrlSchema = z
  .string()
  // ตัดช่องว่างที่ติดมาตอน copy
  .trim()
  // ต้องกรอก
  .min(1, 'URL is required')
  // จำกัดความยาว กันการส่งข้อมูลขนาดใหญ่ผิดปกติ
  .max(2048, 'URL is too long (max 2048 characters)')
  // ตรวจและแปลง
  .transform((value, ctx) => {
    // ตัวแปรเก็บ URL ที่แยกส่วนแล้ว
    let url: URL;
    try {
      // ถ้ารูปแบบผิด new URL จะโยน error
      url = new URL(value);
    } catch {
      // แจ้งว่ารูปแบบไม่ถูกต้อง
      ctx.addIssue({ code: 'custom', message: 'Please enter a valid URL, for example https://www.synerry.com' });
      return z.NEVER;
    }
    // อนุญาตเฉพาะ http และ https กันลิงก์อันตรายเช่น javascript: หรือ data:
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Only http and https URLs are allowed' });
      return z.NEVER;
    }
    // ห้ามมีชื่อผู้ใช้หรือรหัสผ่านใน URL: https://bank.com@evil.com ดูเหมือนไป bank.com แต่จริงๆ ไป evil.com
    if (url.username || url.password) {
      ctx.addIssue({ code: 'custom', message: 'URLs containing a username or password are not allowed' });
      return z.NEVER;
    }
    // ห้ามย่อลิงก์ที่เป็นลิงก์สั้นของเราเอง ไม่งั้นจะเกิด redirect วนไม่รู้จบ
    if (url.host === new URL(config.shortBaseUrl).host) {
      ctx.addIssue({ code: 'custom', message: 'This URL is already a short link' });
      return z.NEVER;
    }
    // ห้ามโดเมนที่อยู่ในรายการบล็อก
    if (isBlockedHost(url.hostname)) {
      ctx.addIssue({ code: 'custom', message: 'This domain is not allowed (link shorteners and known unsafe sites are blocked)' });
      return z.NEVER;
    }
    // คืน URL ในรูปแบบมาตรฐาน
    return url.href;
  });

// ตรวจ alias ที่ผู้ใช้ตั้งเอง
const aliasSchema = z
  .string()
  // ตัดช่องว่าง
  .trim()
  // ยาว 3-30 ตัว ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข - และ _ เพื่อให้พิมพ์และอ่านใน URL ได้ง่าย
  .regex(/^[A-Za-z0-9_-]{3,30}$/, 'Alias must be 3-30 characters: letters, numbers, - or _')
  // ห้ามใช้คำที่จองไว้ (เทียบแบบไม่สนตัวพิมพ์)
  .refine((v) => !RESERVED_ALIASES.has(v.toLowerCase()), 'This alias is reserved');

// ตรวจวันเวลารูปแบบ ISO แล้วแปลงเป็น Date
const dateSchema = z.iso.datetime({ offset: true, message: 'Must be an ISO date-time' }).transform((v) => new Date(v));

// วันหมดอายุต้องอยู่ในอนาคต
const expiresAtSchema = dateSchema.refine((d) => d.getTime() > Date.now(), 'Expiry must be in the future');

// แท็กหนึ่งตัว: 1-30 ตัวอักษร รองรับภาษาไทย ตัวเลข ช่องว่าง - และ _
const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(30, 'Each tag must be at most 30 characters')
  .regex(/^[\p{L}\p{M}\p{N} _-]+$/u, 'Tags may contain letters, numbers, spaces, - and _');

// รายการแท็ก ไม่เกิน 10 ตัว และตัดตัวที่ซ้ำ (ไม่สนตัวพิมพ์) ออก
const tagsSchema = z
  .array(tagSchema)
  .max(10, 'At most 10 tags')
  .transform((tags) => {
    // เก็บชื่อที่เจอแล้ว (ตัวเล็ก)
    const seen = new Set<string>();
    // คงไว้เฉพาะตัวแรกของแต่ละชื่อ
    return tags.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  });

// ตรวจชื่อเรียกลิงก์
const titleSchema = z.string().trim().max(200, 'Title must be at most 200 characters');

// ค่าว่างหรือ null ให้ถือว่าไม่ได้ส่งมา
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
// ค่าว่างให้ถือว่าเป็น null (ใช้ตอนแก้ไข เพื่อลบค่า)
const blankToNull = (v: unknown) => (v === '' ? null : v);

// ข้อมูลที่ใช้สร้างลิงก์ใหม่
export const createLinkSchema = z
  .object({
    // URL ต้นฉบับ บังคับกรอก
    url: originalUrlSchema,
    // alias ไม่บังคับ
    alias: z.preprocess(blankToUndefined, aliasSchema.optional()),
    // ชื่อเรียก ไม่บังคับ
    title: z.preprocess(blankToUndefined, titleSchema.optional()),
    // วันหมดอายุ ไม่บังคับ
    expiresAt: z.preprocess(blankToUndefined, expiresAtSchema.optional()),
    // วันเริ่มใช้งาน ไม่บังคับ
    startsAt: z.preprocess(blankToUndefined, dateSchema.optional()),
    // แท็ก ไม่บังคับ
    tags: tagsSchema.optional(),
  })
  // ถ้ามีทั้งวันเริ่มและวันหมดอายุ วันเริ่มต้องมาก่อน
  .refine((v) => !v.startsAt || !v.expiresAt || v.startsAt < v.expiresAt, {
    message: 'Start date must be before the expiry date',
    path: ['startsAt'],
  });

// ข้อมูลที่แก้ไขได้ภายหลัง (ส่ง null เพื่อลบค่า)
export const updateLinkSchema = z
  .object({
    // ชื่อเรียก
    title: z.preprocess(blankToNull, titleSchema.nullable()).optional(),
    // เปิดหรือปิดใช้งานลิงก์
    isActive: z.boolean().optional(),
    // วันหมดอายุ
    expiresAt: z.preprocess(blankToNull, expiresAtSchema.nullable()).optional(),
    // วันเริ่มใช้งาน
    startsAt: z.preprocess(blankToNull, dateSchema.nullable()).optional(),
    // แท็ก (ส่ง [] เพื่อลบทั้งหมด)
    tags: tagsSchema.optional(),
  })
  // ต้องมีอย่างน้อยหนึ่งฟิลด์ ไม่งั้นไม่รู้จะแก้อะไร
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// ตัวเลือกของหน้าประวัติ: คำค้น แท็ก หน้า และจำนวนต่อหน้า
export const listQuerySchema = z.object({
  // คำค้น ไม่บังคับ
  q: z.string().trim().max(200).optional(),
  // กรองตามแท็ก ไม่บังคับ
  tag: z.string().trim().max(30).optional(),
  // หน้าที่ต้องการ เริ่มที่ 1
  page: z.coerce.number().int().min(1).default(1),
  // จำนวนต่อหน้า 1-100 ค่าเริ่มต้น 20
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// รหัสลิงก์ใน path ต้องเป็นจำนวนเต็มบวก
export const idParamSchema = z.coerce.number().int().positive();

// แปลงรายการปัญหาจาก zod เป็นรูปแบบที่ frontend ใช้แสดงใต้ช่องกรอก
export function toFieldErrors(error: z.ZodError) {
  // คืนรายการ { field, message } โดยแท็กแต่ละตัวรวมเป็นช่อง tags
  return error.issues.map((i) => ({ field: String(i.path[0] ?? '_'), message: i.message }));
}
