// นำเข้า Hono สำหรับสร้างกลุ่ม route
import { Hono } from 'hono';
// นำเข้าตัวสร้างเงื่อนไข query ของ Drizzle
import { and, arrayContains, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
// นำเข้าตัวสร้างรหัสสุ่มจากชุดตัวอักษรที่กำหนดเอง
import { customAlphabet } from 'nanoid';
// นำเข้า zod สำหรับตรวจจำนวนวันของสถิติ
import { z } from 'zod';
// นำเข้าตัวสร้างไฟล์ Excel
import ExcelJS from 'exceljs';
// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง links
import { links, type Link } from '../db/schema';
// นำเข้าตัวแปลงข้อมูลลิงก์ก่อนส่งออก
import { toLinkDto } from '../links/dto';
// นำเข้าตัวสร้างไฟล์ CSV
import { toCsv } from '../links/csv';
// นำเข้ากฎตรวจข้อมูลของลิงก์
import { createLinkSchema, idParamSchema, listQuerySchema, originalUrlSchema, toFieldErrors, updateLinkSchema } from '../links/validation';
// นำเข้า middleware บังคับ login และจำกัดจำนวนครั้ง
import { requireAuth } from '../middleware/requireAuth';
import { rateLimit } from '../middleware/rateLimit';
// นำเข้าชนิดข้อมูลและตัวช่วยสร้าง error
import { apiError, type AppEnv } from '../types';
// นำเข้าตัวเรียก analytics service
import { deleteLinkClicks, getClickCounts, getLinkStats } from '../services/analytics';

// จำนวนวันย้อนหลังของสถิติ อนุญาตเฉพาะ 7 30 หรือ 90 วัน ค่าเริ่มต้น 30
const statsDaysSchema = z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30);

// ตัวสร้างรหัสสั้น 6 ตัวจาก a-z A-Z 0-9 (62 ตัวอักษร ได้ประมาณ 5.6 หมื่นล้านแบบ)
const generateCode = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 6);
// จำนวนครั้งสูงสุดที่ลองสุ่มใหม่เมื่อรหัสชนกับของเดิม
const MAX_CODE_ATTEMPTS = 5;
// ลิงก์ในถังขยะเกินกี่วันจะถูกลบถาวรอัตโนมัติ
export const TRASH_RETENTION_DAYS = 30;
// จำนวนแถวสูงสุดของไฟล์ export กันไฟล์ใหญ่เกินไป
const EXPORT_LIMIT = 10_000;

// เงื่อนไข: ลิงก์ที่ยังไม่อยู่ในถังขยะ
const notDeleted = isNull(links.deletedAt);

// ใส่ \ หน้า % _ และ \ ในคำค้น เพื่อให้ค้นเป็นตัวอักษรธรรมดา ไม่ใช่ wildcard ของ SQL
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ข้อมูลแถวของไฟล์ export ใช้ร่วมกันทั้ง CSV และ Excel
async function exportRows(userId: number) {
  // ดึงลิงก์ทั้งหมดที่ยังไม่ถูกลบ เรียงจากใหม่ไปเก่า
  const rows = await db
    .select()
    .from(links)
    .where(and(eq(links.userId, userId), notDeleted))
    .orderBy(desc(links.createdAt), desc(links.id))
    .limit(EXPORT_LIMIT);
  // ขอยอดคลิกจาก analytics ถ้าไม่พร้อม ยอดคลิกจะเป็น null
  const clickData = await getClickCounts(rows.map((l) => l.id));
  // แปลงเป็นข้อมูลที่พร้อมเขียนลงไฟล์
  return rows.map((l) => ({ ...toLinkDto(l), clicks: clickData ? (clickData.counts[l.id] ?? 0) : null }));
}

// ชื่อไฟล์ตามวันที่ดาวน์โหลด
const exportName = (ext: string) => `synerry-links-${new Date().toISOString().slice(0, 10)}.${ext}`;

// Excel ไม่มีเขตเวลา จึงเลื่อนเวลาให้เป็นเวลาไทย (UTC+7) ก่อนเขียน เพื่อให้เปิดแล้วเห็นเวลาเดียวกับหน้าเว็บ
const toBangkok = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 60 * 60 * 1000) : null);

// สร้างกลุ่ม route ของการจัดการลิงก์
export function linkRoutes() {
  // สร้าง router ย่อย
  const r = new Hono<AppEnv>();
  // ทุก route ในกลุ่มนี้ต้อง login ก่อน
  r.use('*', requireAuth);
  // จำกัดการสร้างลิงก์ไว้ที่ 30 ครั้งต่อนาทีต่อ IP กันการสร้างลิงก์จำนวนมากแบบอัตโนมัติ
  const createLimiter = rateLimit({ max: 30, windowMs: 60 * 1000 });

  // หาลิงก์ตามรหัส โดยต้องเป็นของผู้ใช้คนนี้ และเลือกได้ว่าจะหาในถังขยะหรือนอกถังขยะ
  async function findOwnLink(rawId: string, userId: number, where: 'active' | 'trash' | 'any' = 'active'): Promise<Link | null> {
    // ตรวจว่ารหัสเป็นจำนวนเต็มบวก
    const id = idParamSchema.safeParse(rawId);
    // ถ้าไม่ใช่ ถือว่าไม่พบ
    if (!id.success) return null;
    // เงื่อนไขพื้นฐาน: รหัสลิงก์และเจ้าของต้องตรง
    const conditions: SQL[] = [eq(links.id, id.data), eq(links.userId, userId)];
    // เลือกว่าจะหานอกหรือในถังขยะ
    if (where === 'active') conditions.push(notDeleted);
    if (where === 'trash') conditions.push(isNotNull(links.deletedAt));
    // ค้นหา
    const [link] = await db.select().from(links).where(and(...conditions));
    // คืนลิงก์หรือ null
    return link ?? null;
  }

  // สร้างลิงก์สั้นใหม่
  r.post('/', createLimiter, async (c) => {
    // อ่าน body แบบ JSON
    const body = await c.req.json().catch(() => ({}));
    // ตรวจข้อมูล
    const parsed = createLinkSchema.safeParse(body);
    // ถ้าไม่ผ่าน ตอบ 400 พร้อมบอกว่าผิดที่ช่องไหน
    if (!parsed.success) return c.json(apiError('validation_error', 'Invalid input', toFieldErrors(parsed.error)), 400);
    // แยกข้อมูลที่ผ่านการตรวจแล้ว
    const { url, alias, title, expiresAt, startsAt, tags } = parsed.data;
    // ผู้ใช้ที่ login อยู่
    const user = c.get('user');

    // ถ้าผู้ใช้ตั้ง alias เองให้ลองครั้งเดียว ถ้าสุ่มให้ลองได้หลายครั้งเผื่อชน
    const attempts = alias ? 1 : MAX_CODE_ATTEMPTS;
    for (let i = 0; i < attempts; i++) {
      // ใช้ alias ถ้ามี ไม่งั้นสุ่มรหัสใหม่
      const shortCode = alias ?? generateCode();
      // เพิ่มลิงก์ ถ้ารหัสซ้ำจะไม่เพิ่มและได้ผลลัพธ์ว่าง (ให้ฐานข้อมูลตัดสิน ไม่ต้องเช็กก่อนแล้วค่อยเพิ่ม)
      const [link] = await db
        .insert(links)
        .values({ userId: user.id, originalUrl: url, shortCode, title, expiresAt, startsAt, tags })
        .onConflictDoNothing({ target: links.shortCode })
        .returning();
      // เพิ่มสำเร็จ ตอบ 201 พร้อมข้อมูลลิงก์
      if (link) return c.json({ link: toLinkDto(link) }, 201);
    }
    // alias ที่ตั้งเองมีคนใช้แล้ว (รวมถึงลิงก์ที่อยู่ในถังขยะ เพื่อไม่ให้คนอื่นยึดรหัสเดิมไปใช้) ตอบ 409
    if (alias) return c.json(apiError('alias_taken', 'This alias is already in use', [{ field: 'alias', message: 'This alias is already in use' }]), 409);
    // สุ่มแล้วชนทุกครั้ง ซึ่งแทบเป็นไปไม่ได้ ถือเป็นความผิดพลาดของระบบ
    throw new Error('Could not generate a unique short code');
  });

  // ดูประวัติลิงก์ของผู้ใช้ พร้อมค้นหา กรองแท็ก และแบ่งหน้า
  r.get('/', async (c) => {
    // ตรวจตัวเลือกจาก query string
    const parsed = listQuerySchema.safeParse(c.req.query());
    // ถ้าไม่ผ่าน ตอบ 400
    if (!parsed.success) return c.json(apiError('validation_error', 'Invalid query', toFieldErrors(parsed.error)), 400);
    // แยกค่าที่ผ่านการตรวจแล้ว
    const { q, tag, page, pageSize } = parsed.data;
    // เงื่อนไขหลัก: เฉพาะลิงก์ของผู้ใช้คนนี้ที่ยังไม่อยู่ในถังขยะ
    const conditions: SQL[] = [eq(links.userId, c.get('user').id), notDeleted];
    // ถ้ามีคำค้น ให้ค้นใน URL ต้นฉบับ ชื่อเรียก และรหัสสั้น แบบไม่สนตัวพิมพ์
    if (q) {
      // เตรียมรูปแบบคำค้นแบบ "มีคำนี้อยู่ตรงไหนก็ได้"
      const pattern = `%${escapeLike(q)}%`;
      // เพิ่มเงื่อนไขแบบ OR
      conditions.push(or(ilike(links.originalUrl, pattern), ilike(links.title, pattern), ilike(links.shortCode, pattern))!);
    }
    // ถ้าเลือกแท็ก ให้เอาเฉพาะลิงก์ที่มีแท็กนั้น
    if (tag) conditions.push(arrayContains(links.tags, [tag]));
    // รวมเงื่อนไขทั้งหมดด้วย AND
    const where = and(...conditions);
    // ดึงข้อมูลหน้าที่ต้องการ และนับจำนวนทั้งหมดไปพร้อมกัน
    const [rows, [{ total }]] = await Promise.all([
      // ดึงลิงก์เรียงจากใหม่ไปเก่า
      db.select().from(links).where(where).orderBy(desc(links.createdAt), desc(links.id)).limit(pageSize).offset((page - 1) * pageSize),
      // นับจำนวนลิงก์ทั้งหมดที่ตรงเงื่อนไข ใช้คำนวณจำนวนหน้า
      db.select({ total: count() }).from(links).where(where),
    ]);
    // ขอยอดคลิกของลิงก์ในหน้านี้จาก analytics ในครั้งเดียว
    const clickData = await getClickCounts(rows.map((l) => l.id));
    // ใส่ยอดคลิกให้แต่ละลิงก์ ถ้า analytics ไม่พร้อมให้เป็น null เพื่อให้หน้าเว็บแสดง "-" แทนการแสดง 0 ที่ผิด
    const items = rows.map((l) => ({ ...toLinkDto(l), clicks: clickData ? (clickData.counts[l.id] ?? 0) : null }));
    // ตอบรายการพร้อมข้อมูลการแบ่งหน้า และบอกว่าได้ข้อมูลคลิกหรือไม่
    return c.json({ items, total, page, pageSize, analyticsAvailable: clickData !== null });
  });

  // รายชื่อแท็กทั้งหมดของผู้ใช้ พร้อมจำนวนลิงก์ ใช้ทำปุ่มกรองในหน้าประวัติ
  r.get('/tags', async (c) => {
    // แตก array แท็กของทุกลิงก์ออกเป็นแถว แล้วนับ
    const rows = await db
      .select({ name: sql<string>`unnest(${links.tags})`.as('name'), count: sql<number>`count(*)::int`.as('count') })
      .from(links)
      .where(and(eq(links.userId, c.get('user').id), notDeleted))
      .groupBy(sql`name`)
      .orderBy(sql`count desc, name`);
    // ตอบรายการแท็ก
    return c.json({ tags: rows });
  });

  // หาลิงก์เดิมที่ชี้ไป URL เดียวกัน ใช้เตือนผู้ใช้ก่อนสร้างลิงก์ซ้ำ
  r.get('/duplicates', async (c) => {
    // แปลง URL ให้เป็นรูปแบบมาตรฐานก่อนเทียบ
    const parsed = originalUrlSchema.safeParse(c.req.query('url') ?? '');
    // URL ไม่ถูกต้อง ไม่มีลิงก์ซ้ำแน่นอน
    if (!parsed.success) return c.json({ items: [] });
    // เทียบทั้งแบบมีและไม่มี / ท้าย เพื่อรองรับลิงก์เก่าที่บันทึกก่อนมีการแปลงรูปแบบ
    const candidates = [...new Set([parsed.data, parsed.data.replace(/\/$/, '')])];
    // ค้นลิงก์ของผู้ใช้ที่ตรงกัน ไม่เกิน 5 รายการ
    const rows = await db
      .select()
      .from(links)
      .where(and(eq(links.userId, c.get('user').id), notDeleted, inArray(links.originalUrl, candidates)))
      .orderBy(desc(links.createdAt))
      .limit(5);
    // ตอบรายการ
    return c.json({ items: rows.map(toLinkDto) });
  });

  // ดูถังขยะ และลบถาวรลิงก์ที่อยู่ในถังเกินกำหนด
  r.get('/trash', async (c) => {
    // ผู้ใช้ปัจจุบัน
    const userId = c.get('user').id;
    // เวลาที่เก่ากว่านี้ถือว่าหมดระยะเก็บ
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    // ลบถาวรลิงก์ที่หมดระยะเก็บ แล้วได้รายการรหัสที่ลบ
    const purged = await db
      .delete(links)
      .where(and(eq(links.userId, userId), lt(links.deletedAt, cutoff)))
      .returning({ id: links.id });
    // ลบคลิกของลิงก์เหล่านั้นใน analytics ด้วย
    await Promise.all(purged.map((l) => deleteLinkClicks(l.id)));
    // ดึงลิงก์ที่อยู่ในถังขยะ เรียงจากลบล่าสุด
    const rows = await db
      .select()
      .from(links)
      .where(and(eq(links.userId, userId), isNotNull(links.deletedAt)))
      .orderBy(desc(links.deletedAt));
    // ตอบรายการ พร้อมบอกระยะเก็บให้หน้าเว็บแสดง
    return c.json({ items: rows.map(toLinkDto), retentionDays: TRASH_RETENTION_DAYS });
  });

  // ดาวน์โหลดประวัติลิงก์เป็นไฟล์ CSV (ต้องประกาศก่อน /:id ไม่งั้น export.csv จะถูกมองเป็นรหัสลิงก์)
  r.get('/export.csv', async (c) => {
    // ดึงข้อมูล
    const rows = await exportRows(c.get('user').id);
    // สร้างเนื้อหา CSV
    const csv = toCsv(
      // หัวตาราง
      ['Short URL', 'Original URL', 'Title', 'Tags', 'Status', 'Clicks', 'Created At', 'Starts At', 'Expires At'],
      // แถวข้อมูล เรียงค่าตามหัวตาราง
      rows.map((d) => [d.shortUrl, d.originalUrl, d.title, d.tags.join(', '), d.status, d.clicks ?? '', d.createdAt, d.startsAt, d.expiresAt]),
    );
    // บอก browser ว่าเป็นไฟล์ CSV และให้ดาวน์โหลดแทนการเปิดดู
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${exportName('csv')}"`);
    // ห้าม cache เพราะเป็นข้อมูลส่วนตัว
    c.header('Cache-Control', 'no-store');
    // ส่งเนื้อหาไฟล์
    return c.body(csv);
  });

  // ดาวน์โหลดประวัติลิงก์เป็นไฟล์ Excel
  r.get('/export.xlsx', async (c) => {
    // ดึงข้อมูล
    const rows = await exportRows(c.get('user').id);
    // สร้างไฟล์ Excel ใหม่
    const wb = new ExcelJS.Workbook();
    // ตั้งชื่อผู้สร้างไฟล์
    wb.creator = 'Synerry Short URL';
    // สร้าง sheet โดยตรึงแถวหัวตารางไว้ตอนเลื่อน
    const ws = wb.addWorksheet('Links', { views: [{ state: 'frozen', ySplit: 1 }] });
    // กำหนดคอลัมน์ ชื่อหัวตาราง และความกว้าง
    ws.columns = [
      { header: 'Short URL', key: 'shortUrl', width: 32 },
      { header: 'Original URL', key: 'originalUrl', width: 50 },
      { header: 'Title', key: 'title', width: 28 },
      { header: 'Tags', key: 'tags', width: 20 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Clicks', key: 'clicks', width: 9 },
      { header: 'Created At (TH)', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: 'Starts At (TH)', key: 'startsAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
      { header: 'Expires At (TH)', key: 'expiresAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    ];
    // เพิ่มแถวข้อมูล (ค่าเป็นชนิดข้อความหรือตัวเลขเสมอ Excel จึงไม่รันเป็นสูตร)
    for (const d of rows) {
      ws.addRow({
        // ลิงก์สั้นเป็น hyperlink กดเปิดได้จาก Excel
        shortUrl: { text: d.shortUrl, hyperlink: d.shortUrl },
        originalUrl: d.originalUrl,
        title: d.title ?? '',
        tags: d.tags.join(', '),
        status: d.status,
        clicks: d.clicks,
        createdAt: toBangkok(d.createdAt),
        startsAt: toBangkok(d.startsAt),
        expiresAt: toBangkok(d.expiresAt),
      });
    }
    // จัดรูปแบบหัวตาราง: ตัวหนา สีขาว พื้นกรมท่าตามแบรนด์
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2340' } };
    // เปิดปุ่มกรองข้อมูลที่หัวตาราง
    ws.autoFilter = { from: 'A1', to: 'I1' };
    // เขียนไฟล์เป็น buffer
    const buffer = await wb.xlsx.writeBuffer();
    // ตั้ง header ของไฟล์ Excel
    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${exportName('xlsx')}"`);
    c.header('Cache-Control', 'no-store');
    // ส่งไฟล์
    return c.body(new Uint8Array(buffer as ArrayBuffer));
  });

  // ดูลิงก์เดียว
  r.get('/:id', async (c) => {
    // หาลิงก์ของผู้ใช้
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    // ไม่พบหรือไม่ใช่ของผู้ใช้ ตอบ 404 เหมือนกัน เพื่อไม่ให้รู้ว่ามีลิงก์นี้ของคนอื่นอยู่
    if (!link) return c.json(apiError('not_found', 'Link not found'), 404);
    // ตอบข้อมูลลิงก์
    return c.json({ link: toLinkDto(link) });
  });

  // สถิติของลิงก์หนึ่ง: ตรวจความเป็นเจ้าของที่ gateway ก่อน แล้วค่อยขอข้อมูลจาก analytics
  r.get('/:id/stats', async (c) => {
    // หาลิงก์ของผู้ใช้
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    // ไม่พบ ตอบ 404
    if (!link) return c.json(apiError('not_found', 'Link not found'), 404);
    // ตรวจจำนวนวัน
    const days = statsDaysSchema.safeParse(c.req.query('days'));
    // ไม่ถูกต้อง ตอบ 400
    if (!days.success) return c.json(apiError('validation_error', 'days must be 7, 30 or 90'), 400);
    // ขอสถิติจาก analytics
    const stats = await getLinkStats(link.id, days.data);
    // ถ้า analytics ไม่พร้อม ตอบ 503 ให้หน้าเว็บแสดงข้อความว่าสถิติยังไม่พร้อม
    if (!stats) return c.json(apiError('analytics_unavailable', 'Statistics are temporarily unavailable'), 503);
    // ตอบข้อมูลลิงก์พร้อมสถิติ
    return c.json({ link: toLinkDto(link), stats });
  });

  // แก้ไขลิงก์: ชื่อเรียก แท็ก สถานะ วันเริ่ม และวันหมดอายุ
  r.patch('/:id', async (c) => {
    // หาลิงก์ของผู้ใช้
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    // ไม่พบ ตอบ 404
    if (!link) return c.json(apiError('not_found', 'Link not found'), 404);
    // อ่าน body แบบ JSON
    const body = await c.req.json().catch(() => ({}));
    // ตรวจข้อมูล
    const parsed = updateLinkSchema.safeParse(body);
    // ถ้าไม่ผ่าน ตอบ 400
    if (!parsed.success) return c.json(apiError('validation_error', 'Invalid input', toFieldErrors(parsed.error)), 400);
    // ลิงก์ที่ผู้ดูแลระงับไว้ เจ้าของเปิดใช้งานเองไม่ได้ (แก้ชื่อหรือแท็กยังทำได้)
    if (link.lockedAt && parsed.data.isActive !== undefined) {
      return c.json(apiError('link_locked', 'This link was suspended by an administrator'), 403);
    }
    // วันเริ่มและวันหมดอายุหลังแก้ไข (ถ้าไม่ได้ส่งมาใช้ค่าเดิม)
    const nextStart = parsed.data.startsAt !== undefined ? parsed.data.startsAt : link.startsAt;
    const nextExpiry = parsed.data.expiresAt !== undefined ? parsed.data.expiresAt : link.expiresAt;
    // วันเริ่มต้องมาก่อนวันหมดอายุ
    if (nextStart && nextExpiry && nextStart >= nextExpiry) {
      return c.json(apiError('validation_error', 'Invalid input', [{ field: 'startsAt', message: 'Start date must be before the expiry date' }]), 400);
    }
    // อัปเดตเฉพาะฟิลด์ที่ส่งมา (updatedAt จะอัปเดตเองอัตโนมัติ)
    const [updated] = await db.update(links).set(parsed.data).where(eq(links.id, link.id)).returning();
    // ตอบข้อมูลใหม่
    return c.json({ link: toLinkDto(updated) });
  });

  // ย้ายลิงก์ลงถังขยะ: ลิงก์ใช้ไม่ได้ทันที แต่กู้คืนได้ภายในระยะเก็บ
  r.delete('/:id', async (c) => {
    // หาลิงก์ของผู้ใช้ (ที่ยังไม่อยู่ในถังขยะ)
    const link = await findOwnLink(c.req.param('id'), c.get('user').id);
    // ไม่พบ ตอบ 404
    if (!link) return c.json(apiError('not_found', 'Link not found'), 404);
    // บันทึกเวลาที่ลบ
    await db.update(links).set({ deletedAt: new Date() }).where(eq(links.id, link.id));
    // ตอบ 204 ไม่มีเนื้อหา
    return c.body(null, 204);
  });

  // กู้คืนลิงก์จากถังขยะ
  r.post('/:id/restore', async (c) => {
    // หาลิงก์ของผู้ใช้ที่อยู่ในถังขยะ
    const link = await findOwnLink(c.req.param('id'), c.get('user').id, 'trash');
    // ไม่พบ ตอบ 404
    if (!link) return c.json(apiError('not_found', 'Link not found in trash'), 404);
    // ล้างเวลาที่ลบ ลิงก์กลับมาใช้งานได้
    const [restored] = await db.update(links).set({ deletedAt: null }).where(eq(links.id, link.id)).returning();
    // ตอบข้อมูลลิงก์
    return c.json({ link: toLinkDto(restored) });
  });

  // ลบถาวร: ลบลิงก์และสถิติทั้งหมด กู้คืนไม่ได้
  r.delete('/:id/permanent', async (c) => {
    // หาลิงก์ของผู้ใช้ (ทั้งในและนอกถังขยะ)
    const link = await findOwnLink(c.req.param('id'), c.get('user').id, 'any');
    // ไม่พบ ตอบ 404
    if (!link) return c.json(apiError('not_found', 'Link not found'), 404);
    // ลบลิงก์ออกจากฐานข้อมูลของ gateway ก่อน
    await db.delete(links).where(eq(links.id, link.id));
    // แล้วขอให้ analytics ลบคลิกของลิงก์นี้ ถ้า analytics ไม่พร้อม คลิกจะค้างอยู่แต่ไม่มีใครเห็นได้ (ไม่มีลิงก์ให้อ้างถึงแล้ว)
    await deleteLinkClicks(link.id);
    // ตอบ 204 ไม่มีเนื้อหา
    return c.body(null, 204);
  });

  // คืน router ที่ตั้งค่าเสร็จแล้ว
  return r;
}
