// นำเข้า Hono สำหรับสร้างกลุ่ม route
import { Hono } from 'hono';
// นำเข้าตัวสร้างเงื่อนไข query
import { eq } from 'drizzle-orm';
// นำเข้า zod สำหรับตรวจข้อมูล
import { z } from 'zod';
// นำเข้า middleware ตรวจ key ระหว่าง service
import { requireInternalKey } from '@synerry/shared';
// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง clicks
import { clicks } from '../db/schema';
// นำเข้าตัวแยก user agent และตัว hash IP
import { hashIp, parseUserAgent } from '../clicks/parse';
// นำเข้าตัวหาประเทศจาก IP
import { countryFromIp } from '../clicks/geo';
// นำเข้าฟังก์ชันคำนวณสถิติ
import { getClickCounts, getLinkStats } from '../stats';
// นำเข้าค่าตั้งค่า
import { config } from '../config';

// ข้อมูลการคลิกหนึ่งครั้งที่ redirect service ส่งมา
const clickSchema = z.object({
  // รหัสลิงก์ใน gateway
  linkId: z.number().int().positive(),
  // เวลาที่คลิก ถ้าไม่ส่งมาใช้เวลาปัจจุบัน
  clickedAt: z.iso.datetime({ offset: true }).optional(),
  // IP ของผู้คลิก จะถูก hash ก่อนเก็บเสมอ
  ip: z.string().max(64).optional(),
  // user agent ของ browser ตัดความยาวกันข้อมูลใหญ่ผิดปกติ
  userAgent: z.string().max(1000).optional(),
  // หน้าเว็บที่ส่งผู้ใช้มา
  referer: z.string().max(2000).optional(),
});

// ข้อมูลที่ใช้ขอยอดคลิกของหลายลิงก์
const summarySchema = z.object({
  // รายการรหัสลิงก์ ไม่เกิน 1000 ตัวต่อครั้ง
  linkIds: z.array(z.number().int().positive()).max(1000),
});

// รหัสลิงก์ใน path
const linkIdParam = z.coerce.number().int().positive();
// จำนวนวันย้อนหลังของสถิติ 1-365 ค่าเริ่มต้น 30
const daysQuery = z.coerce.number().int().min(1).max(365).default(30);

// ตอบ error รูปแบบเดียวกับ gateway
const error = (code: string, message: string) => ({ error: { code, message } });

// route ภายในทั้งหมดของ analytics (service นี้ไม่มี route สาธารณะเลย)
export function internalRoutes() {
  // สร้าง router ย่อย
  const r = new Hono();
  // ทุก route ต้องแนบ key ภายในที่ถูกต้อง
  r.use('*', requireInternalKey(() => config.internalApiKey));

  // บันทึกการคลิกหนึ่งครั้ง
  r.post('/clicks', async (c) => {
    // ตรวจข้อมูลที่ส่งมา
    const parsed = clickSchema.safeParse(await c.req.json().catch(() => ({})));
    // ข้อมูลไม่ถูกต้อง ตอบ 400
    if (!parsed.success) return c.json(error('validation_error', 'Invalid click event'), 400);
    // แยกข้อมูล
    const { linkId, clickedAt, ip, userAgent, referer } = parsed.data;
    // แยกข้อมูลอุปกรณ์จาก user agent
    const agent = parseUserAgent(userAgent);
    // หาประเทศจาก IP ก่อน hash (หลัง hash แล้วจะหาประเทศไม่ได้อีก และเราไม่เก็บ IP จริง)
    const country = await countryFromIp(ip);
    // บันทึกลงฐานข้อมูล โดยเก็บ IP แบบ hash เท่านั้น
    const [row] = await db
      .insert(clicks)
      .values({
        linkId,
        clickedAt: clickedAt ? new Date(clickedAt) : undefined,
        ipHash: hashIp(ip),
        userAgent,
        referer: referer || null,
        country,
        ...agent,
      })
      .returning({ id: clicks.id });
    // ตอบ 201 พร้อมรหัสการคลิก
    return c.json({ id: row.id }, 201);
  });

  // สถิติเต็มของลิงก์หนึ่ง
  r.get('/stats/:linkId', async (c) => {
    // ตรวจรหัสลิงก์
    const linkId = linkIdParam.safeParse(c.req.param('linkId'));
    // ตรวจจำนวนวัน
    const days = daysQuery.safeParse(c.req.query('days'));
    // ถ้าไม่ถูกต้อง ตอบ 400
    if (!linkId.success || !days.success) return c.json(error('validation_error', 'Invalid link id or days'), 400);
    // คำนวณและตอบสถิติ
    return c.json(await getLinkStats(linkId.data, days.data));
  });

  // ยอดคลิกของหลายลิงก์ในครั้งเดียว
  r.post('/stats/summary', async (c) => {
    // ตรวจข้อมูลที่ส่งมา
    const parsed = summarySchema.safeParse(await c.req.json().catch(() => ({})));
    // ข้อมูลไม่ถูกต้อง ตอบ 400
    if (!parsed.success) return c.json(error('validation_error', 'linkIds must be an array of up to 1000 ids'), 400);
    // นับยอดคลิกของแต่ละลิงก์
    const counts = await getClickCounts(parsed.data.linkIds);
    // รวมยอดทั้งหมด
    const totalClicks = Object.values(counts).reduce((sum, n) => sum + n, 0);
    // ตอบผลลัพธ์
    return c.json({ counts, totalClicks });
  });

  // ลบการคลิกทั้งหมดของลิงก์ ใช้เมื่อเจ้าของลบลิงก์
  r.delete('/clicks/:linkId', async (c) => {
    // ตรวจรหัสลิงก์
    const linkId = linkIdParam.safeParse(c.req.param('linkId'));
    // ไม่ถูกต้อง ตอบ 400
    if (!linkId.success) return c.json(error('validation_error', 'Invalid link id'), 400);
    // ลบแล้วนับจำนวนที่ลบ
    const deleted = await db.delete(clicks).where(eq(clicks.linkId, linkId.data)).returning({ id: clicks.id });
    // ตอบจำนวนที่ลบ
    return c.json({ deleted: deleted.length });
  });

  // คืน router ที่ตั้งค่าเสร็จแล้ว
  return r;
}
