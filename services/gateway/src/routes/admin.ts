// นำเข้า Hono สำหรับสร้างกลุ่ม route
import { Hono } from 'hono';
// นำเข้าตัวสร้างเงื่อนไข query ของ Drizzle
import { and, count, desc, eq, gte, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
// นำเข้า zod สำหรับตรวจข้อมูล
import { z } from 'zod';
// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง
import { blockedDomains, links, users } from '../db/schema';
// นำเข้าตัวแปลงข้อมูลลิงก์
import { toLinkDto } from '../links/dto';
// นำเข้าตัวจัดการ blocklist
import { BUILT_IN_BLOCKED, normalizeDomain, refreshBlocklist } from '../links/blocklist';
// นำเข้าตัวตรวจรหัสใน path และตัวแปลง error ของช่องกรอก
import { idParamSchema, toFieldErrors } from '../links/validation';
// นำเข้าตัวลบ session ทั้งหมดของผู้ใช้
import { deleteUserSessions } from '../auth/session';
// นำเข้า middleware บังคับ login และบังคับเป็นผู้ดูแล
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
// นำเข้าตัวเรียก analytics
import { getClickCounts } from '../services/analytics';
// นำเข้าชนิดข้อมูลและตัวช่วยสร้าง error
import { apiError, type AppEnv } from '../types';

// ตัวเลือกของรายการแบบแบ่งหน้า: คำค้น หน้า และจำนวนต่อหน้า
const pageQuery = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ตัวกรองลิงก์ของหน้าผู้ดูแล: ทั้งหมด หรือเฉพาะที่ถูกระงับ
const linkFilter = pageQuery.extend({ filter: z.enum(['all', 'locked']).default('all') });

// ข้อมูลที่ใช้ระงับลิงก์: ต้องใส่เหตุผลเสมอ เพื่อให้เจ้าของลิงก์รู้ว่าทำไม
const lockSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });

// ข้อมูลที่ใช้เปลี่ยนสถานะบัญชี
const userStatusSchema = z.object({ isActive: z.boolean() });

// รูปแบบชื่อโดเมน: ส่วนละ 1-63 ตัว (a-z 0-9 -) คั่นด้วยจุด อย่างน้อยสองส่วน
const DOMAIN_PATTERN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

// ข้อมูลที่ใช้เพิ่มโดเมนใน blocklist (รับได้ทั้งชื่อโดเมนหรือ URL เต็ม จะตัดเหลือแค่ชื่อโดเมน)
const blockSchema = z.object({
  domain: z
    .string()
    .trim()
    .transform((v, ctx) => {
      // ถ้าวาง URL เต็มมา ให้ดึงเฉพาะชื่อโดเมน
      let host = v;
      try {
        if (/^https?:\/\//i.test(v)) host = new URL(v).hostname;
      } catch {
        // อ่าน URL ไม่ได้ ใช้ข้อความเดิมตรวจต่อ
      }
      // แปลงรูปแบบให้เป็นมาตรฐาน
      const domain = normalizeDomain(host);
      // ตรวจรูปแบบชื่อโดเมน
      if (!DOMAIN_PATTERN.test(domain)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a domain name, for example phishing-site.com' });
        return z.NEVER;
      }
      // คืนชื่อโดเมน
      return domain;
    }),
  reason: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(300).optional()),
});

// ใส่ \ หน้า % _ และ \ ในคำค้น เพื่อให้ค้นเป็นตัวอักษรธรรมดา
const escapeLike = (term: string) => term.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// กลุ่ม route ของผู้ดูแลระบบ (ทุก route ต้อง login และเป็นผู้ดูแล)
export function adminRoutes() {
  // สร้าง router ย่อย
  const r = new Hono<AppEnv>();
  // ต้อง login ก่อน แล้วต้องเป็นผู้ดูแล
  r.use('*', requireAuth, requireAdmin);

  // ภาพรวมทั้งระบบ
  r.get('/summary', async (c) => {
    // เวลาเมื่อ 7 วันก่อน ใช้นับลิงก์ใหม่
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // นับทุกอย่างพร้อมกัน
    const [[u], [l], [locked], [recent], [blocked], ids] = await Promise.all([
      // ผู้ใช้ทั้งหมด และที่ถูกระงับ
      db.select({ total: count(), suspended: sql<number>`count(*) filter (where ${users.isActive} = false)::int` }).from(users),
      // ลิงก์ที่ยังไม่อยู่ในถังขยะ
      db.select({ total: count() }).from(links).where(isNull(links.deletedAt)),
      // ลิงก์ที่ถูกระงับ
      db.select({ total: count() }).from(links).where(and(isNull(links.deletedAt), isNotNull(links.lockedAt))),
      // ลิงก์ที่สร้างใน 7 วันล่าสุด
      db.select({ total: count() }).from(links).where(and(isNull(links.deletedAt), gte(links.createdAt, weekAgo))),
      // โดเมนที่ผู้ดูแลบล็อกเพิ่ม
      db.select({ total: count() }).from(blockedDomains),
      // รหัสลิงก์ทั้งหมด ใช้ขอยอดคลิกรวม (จำกัด 1000 ตามขีดของ analytics)
      db.select({ id: links.id }).from(links).where(isNull(links.deletedAt)).limit(1000),
    ]);
    // ขอยอดคลิกรวมจาก analytics
    const clickData = await getClickCounts(ids.map((x) => x.id));
    // ตอบข้อมูลสรุป
    return c.json({
      users: u.total,
      suspendedUsers: u.suspended,
      links: l.total,
      lockedLinks: locked.total,
      linksLast7Days: recent.total,
      blockedDomains: blocked.total + BUILT_IN_BLOCKED.length,
      totalClicks: clickData?.totalClicks ?? null,
    });
  });

  // รายชื่อผู้ใช้ พร้อมจำนวนลิงก์ของแต่ละคน
  r.get('/users', async (c) => {
    // ตรวจตัวเลือก
    const parsed = pageQuery.safeParse(c.req.query());
    // ไม่ถูกต้อง ตอบ 400
    if (!parsed.success) return c.json(apiError('validation_error', 'Invalid query', toFieldErrors(parsed.error)), 400);
    // แยกค่า
    const { q, page, pageSize } = parsed.data;
    // เงื่อนไขค้นชื่อผู้ใช้
    const where = q ? ilike(users.username, `%${escapeLike(q)}%`) : undefined;
    // ดึงผู้ใช้ พร้อมนับลิงก์ด้วย subquery (ไม่นับลิงก์ในถังขยะ) และนับจำนวนทั้งหมด
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
          // เขียนชื่อตารางกำกับเองทุกคอลัมน์ เพราะใน subquery ชื่อ "id" เฉยๆ จะถูกตีความเป็น id ของตาราง links แทน users
          linkCount: sql<number>`(select count(*)::int from links l where l.user_id = "users"."id" and l.deleted_at is null)`,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: count() }).from(users).where(where),
    ]);
    // ตอบรายการ
    return c.json({ items: rows, total, page, pageSize });
  });

  // ระงับหรือเปิดบัญชีผู้ใช้
  r.patch('/users/:id', async (c) => {
    // ตรวจรหัสผู้ใช้
    const id = idParamSchema.safeParse(c.req.param('id'));
    // ตรวจข้อมูล
    const body = userStatusSchema.safeParse(await c.req.json().catch(() => ({})));
    // ไม่ถูกต้อง ตอบ 400
    if (!id.success || !body.success) return c.json(apiError('validation_error', 'Invalid input'), 400);
    // ห้ามระงับตัวเอง กันผู้ดูแลล็อกตัวเองออกจากระบบ
    if (id.data === c.get('user').id) return c.json(apiError('cannot_change_self', 'You cannot change your own account status'), 400);
    // หาผู้ใช้เป้าหมาย
    const [target] = await db.select().from(users).where(eq(users.id, id.data));
    // ไม่พบ ตอบ 404
    if (!target) return c.json(apiError('not_found', 'User not found'), 404);
    // ห้ามระงับผู้ดูแลคนอื่น (ต้องจัดการผ่านฐานข้อมูลโดยตรง เพื่อไม่ให้ผู้ดูแลแย่งกันระงับ)
    if (target.role === 'admin') return c.json(apiError('cannot_change_admin', 'Administrator accounts cannot be suspended here'), 400);
    // บันทึกสถานะใหม่
    const [updated] = await db
      .update(users)
      .set({ isActive: body.data.isActive })
      .where(eq(users.id, target.id))
      .returning({ id: users.id, username: users.username, role: users.role, isActive: users.isActive, createdAt: users.createdAt });
    // ถ้าระงับ ให้ตัด session ทุกเครื่องของผู้ใช้นั้นทันที
    if (!body.data.isActive) await deleteUserSessions(target.id);
    // ตอบข้อมูลผู้ใช้
    return c.json({ user: updated });
  });

  // ลิงก์ของทุกคน ค้นได้จาก URL รหัสสั้น หรือชื่อเจ้าของ
  r.get('/links', async (c) => {
    // ตรวจตัวเลือก
    const parsed = linkFilter.safeParse(c.req.query());
    // ไม่ถูกต้อง ตอบ 400
    if (!parsed.success) return c.json(apiError('validation_error', 'Invalid query', toFieldErrors(parsed.error)), 400);
    // แยกค่า
    const { q, page, pageSize, filter } = parsed.data;
    // เงื่อนไขหลัก: ไม่นับลิงก์ในถังขยะ
    const conditions: SQL[] = [isNull(links.deletedAt)];
    // กรองเฉพาะที่ถูกระงับ
    if (filter === 'locked') conditions.push(isNotNull(links.lockedAt));
    // คำค้น
    if (q) {
      // รูปแบบคำค้น
      const pattern = `%${escapeLike(q)}%`;
      // ค้นใน URL รหัสสั้น และชื่อเจ้าของ
      conditions.push(or(ilike(links.originalUrl, pattern), ilike(links.shortCode, pattern), ilike(users.username, pattern))!);
    }
    // รวมเงื่อนไข
    const where = and(...conditions);
    // ดึงลิงก์พร้อมชื่อเจ้าของ และนับจำนวนทั้งหมด
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ link: links, owner: users.username, ownerActive: users.isActive })
        .from(links)
        .innerJoin(users, eq(users.id, links.userId))
        .where(where)
        .orderBy(desc(links.createdAt), desc(links.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ total: count() }).from(links).innerJoin(users, eq(users.id, links.userId)).where(where),
    ]);
    // ขอยอดคลิกของหน้านี้
    const clickData = await getClickCounts(rows.map((r) => r.link.id));
    // รวมข้อมูล
    const items = rows.map((r) => ({
      ...toLinkDto(r.link),
      owner: r.owner,
      ownerActive: r.ownerActive,
      clicks: clickData ? (clickData.counts[r.link.id] ?? 0) : null,
    }));
    // ตอบรายการ
    return c.json({ items, total, page, pageSize, analyticsAvailable: clickData !== null });
  });

  // ระงับลิงก์ (เช่น ลิงก์หลอกลวง) พร้อมเหตุผล
  r.post('/links/:id/lock', async (c) => {
    // ตรวจรหัสลิงก์
    const id = idParamSchema.safeParse(c.req.param('id'));
    // ตรวจเหตุผล
    const body = lockSchema.safeParse(await c.req.json().catch(() => ({})));
    // ไม่ถูกต้อง ตอบ 400
    if (!id.success) return c.json(apiError('not_found', 'Link not found'), 404);
    if (!body.success) return c.json(apiError('validation_error', 'Invalid input', toFieldErrors(body.error)), 400);
    // บันทึกการระงับ
    const [updated] = await db
      .update(links)
      .set({ lockedAt: new Date(), lockReason: body.data.reason, lockedBy: c.get('user').id })
      .where(and(eq(links.id, id.data), isNull(links.deletedAt)))
      .returning();
    // ไม่พบ ตอบ 404
    if (!updated) return c.json(apiError('not_found', 'Link not found'), 404);
    // ตอบข้อมูลลิงก์
    return c.json({ link: toLinkDto(updated) });
  });

  // ยกเลิกการระงับลิงก์
  r.post('/links/:id/unlock', async (c) => {
    // ตรวจรหัสลิงก์
    const id = idParamSchema.safeParse(c.req.param('id'));
    // ไม่ถูกต้อง ตอบ 404
    if (!id.success) return c.json(apiError('not_found', 'Link not found'), 404);
    // ล้างข้อมูลการระงับ
    const [updated] = await db
      .update(links)
      .set({ lockedAt: null, lockReason: null, lockedBy: null })
      .where(and(eq(links.id, id.data), isNull(links.deletedAt)))
      .returning();
    // ไม่พบ ตอบ 404
    if (!updated) return c.json(apiError('not_found', 'Link not found'), 404);
    // ตอบข้อมูลลิงก์
    return c.json({ link: toLinkDto(updated) });
  });

  // รายการ blocklist: รายการในระบบ (ลบไม่ได้) และรายการที่ผู้ดูแลเพิ่ม
  r.get('/blocklist', async (c) => {
    // ดึงรายการที่ผู้ดูแลเพิ่ม พร้อมชื่อผู้เพิ่ม
    const rows = await db
      .select({
        id: blockedDomains.id,
        domain: blockedDomains.domain,
        reason: blockedDomains.reason,
        createdAt: blockedDomains.createdAt,
        createdBy: users.username,
      })
      .from(blockedDomains)
      .leftJoin(users, eq(users.id, blockedDomains.createdBy))
      .orderBy(desc(blockedDomains.createdAt));
    // ตอบทั้งสองกลุ่ม
    return c.json({ builtIn: BUILT_IN_BLOCKED, items: rows });
  });

  // เพิ่มโดเมนใน blocklist
  r.post('/blocklist', async (c) => {
    // ตรวจข้อมูล
    const parsed = blockSchema.safeParse(await c.req.json().catch(() => ({})));
    // ไม่ถูกต้อง ตอบ 400
    if (!parsed.success) return c.json(apiError('validation_error', 'Invalid input', toFieldErrors(parsed.error)), 400);
    // อยู่ในรายการของระบบอยู่แล้ว
    if (BUILT_IN_BLOCKED.includes(parsed.data.domain)) return c.json(apiError('already_blocked', 'This domain is already blocked'), 409);
    // เพิ่ม ถ้าซ้ำจะไม่เพิ่ม
    const [row] = await db
      .insert(blockedDomains)
      .values({ domain: parsed.data.domain, reason: parsed.data.reason, createdBy: c.get('user').id })
      .onConflictDoNothing({ target: blockedDomains.domain })
      .returning();
    // ซ้ำ ตอบ 409
    if (!row) return c.json(apiError('already_blocked', 'This domain is already blocked'), 409);
    // โหลดรายการใหม่เข้าหน่วยความจำ มีผลทันทีทั้งการสร้างลิงก์และ redirect
    await refreshBlocklist();
    // ตอบรายการที่เพิ่ม
    return c.json({ item: row }, 201);
  });

  // ลบโดเมนออกจาก blocklist (เฉพาะรายการที่ผู้ดูแลเพิ่ม)
  r.delete('/blocklist/:id', async (c) => {
    // ตรวจรหัส
    const id = idParamSchema.safeParse(c.req.param('id'));
    // ไม่ถูกต้อง ตอบ 404
    if (!id.success) return c.json(apiError('not_found', 'Not found'), 404);
    // ลบ
    const deleted = await db.delete(blockedDomains).where(eq(blockedDomains.id, id.data)).returning({ id: blockedDomains.id });
    // ไม่พบ ตอบ 404
    if (!deleted.length) return c.json(apiError('not_found', 'Not found'), 404);
    // โหลดรายการใหม่เข้าหน่วยความจำ
    await refreshBlocklist();
    // ตอบ 204
    return c.body(null, 204);
  });

  // คืน router ที่ตั้งค่าเสร็จแล้ว
  return r;
}
