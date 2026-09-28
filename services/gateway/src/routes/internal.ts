// นำเข้า Hono สำหรับสร้างกลุ่ม route
import { Hono } from 'hono';
// นำเข้าตัวสร้างเงื่อนไข query
import { and, eq, isNull } from 'drizzle-orm';
// นำเข้า middleware ตรวจ key ระหว่าง service
import { requireInternalKey } from '@synerry/shared';
// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง links
import { links, users } from '../db/schema';
// นำเข้าตัวตรวจโดเมนที่ถูกบล็อก
import { isBlockedUrl } from '../links/blocklist';
// นำเข้าค่าตั้งค่า
import { config } from '../config';
// นำเข้าตัวช่วยสร้าง error
import { apiError } from '../types';

// route ภายในสำหรับ service อื่นเรียก ไม่เปิดให้ browser ใช้
export function internalRoutes() {
  // สร้าง router ย่อย
  const r = new Hono();
  // ทุก route ในกลุ่มนี้ต้องแนบ key ภายในที่ถูกต้อง
  r.use('*', requireInternalKey(() => config.internalApiKey));

  // redirect service ใช้ค้นลิงก์จากรหัสสั้น
  r.get('/links/:code', async (c) => {
    // ค้นลิงก์พร้อมสถานะบัญชีเจ้าของ ไม่นับลิงก์ในถังขยะ
    const [row] = await db
      .select({
        id: links.id,
        originalUrl: links.originalUrl,
        linkActive: links.isActive,
        lockedAt: links.lockedAt,
        ownerActive: users.isActive,
        startsAt: links.startsAt,
        expiresAt: links.expiresAt,
      })
      .from(links)
      .innerJoin(users, eq(users.id, links.userId))
      .where(and(eq(links.shortCode, c.req.param('code')), isNull(links.deletedAt)));
    // ไม่พบ (หรืออยู่ในถังขยะ) ตอบ 404
    if (!row) return c.json(apiError('not_found', 'Link not found'), 404);
    // ส่งเฉพาะที่ redirect ต้องใช้ ไม่ส่งข้อมูลเจ้าของออกไป
    return c.json({
      id: row.id,
      originalUrl: row.originalUrl,
      // ลิงก์ใช้ได้เมื่อ: เจ้าของเปิดไว้ ผู้ดูแลไม่ได้ระงับ และบัญชีเจ้าของไม่ถูกระงับ
      isActive: row.linkActive && !row.lockedAt && row.ownerActive,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      // ตรวจ blocklist ตอนนี้เลย ถ้าเพิ่มโดเมนในรายการภายหลัง ลิงก์เก่าที่ชี้ไปโดเมนนั้นจะหยุดทำงานทันที
      blocked: isBlockedUrl(row.originalUrl),
    });
  });

  // คืน router ที่ตั้งค่าเสร็จแล้ว
  return r;
}
