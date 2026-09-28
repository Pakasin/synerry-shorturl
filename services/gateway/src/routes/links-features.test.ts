// นำเข้าฟังก์ชันของ vitest สำหรับเขียน test
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// นำเข้าตัวสร้างเงื่อนไข query
import { eq } from 'drizzle-orm';
// นำเข้าตัวอ่านไฟล์ Excel เพื่อตรวจไฟล์ที่ export
import ExcelJS from 'exceljs';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from '../app';
// นำเข้า connection ฐานข้อมูล (ต่อกับฐานข้อมูล test)
import { db, sql } from '../db/client';
// นำเข้านิยามตาราง
import { links, users } from '../db/schema';
// นำเข้าตัวช่วยที่ใช้ร่วมกันระหว่างไฟล์ test
import * as h from '../../test/helpers';
// นำเข้าตัวช่วยอ่าน JSON และสมัครผู้ใช้
import { json, registerAndLogin } from '../../test/helpers';

// ตัวแปรเก็บ app และ cookie ของผู้ใช้
let app: ReturnType<typeof createApp>;
let alice: string;
let bob: string;

// ส่ง request ไปที่ app ของ test ปัจจุบัน
const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
// สร้างลิงก์และคืน response
const create = (cookie: string, body: Record<string, unknown>) => send('POST', '/api/links', { cookie, body });
// สร้างลิงก์และคืนข้อมูลลิงก์ (ต้องสำเร็จ)
const createOk = async (cookie: string, body: Record<string, unknown>) => (await json(await create(cookie, body))).link;
// header ของการเรียก route ภายใน
const INTERNAL = { 'x-internal-key': 'test-internal-key' };
// เวลาในอนาคตหรืออดีตจากตอนนี้ (หน่วยชั่วโมง)
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

// ก่อนแต่ละ test ล้างข้อมูล สร้าง app และผู้ใช้สองคน
beforeEach(async () => {
  await sql`truncate users, links, sessions restart identity cascade`;
  app = createApp();
  alice = await registerAndLogin(app, 'alice');
  bob = await registerAndLogin(app, 'bob');
});

// หลัง test ทั้งหมดเสร็จ ปิด connection pool
afterAll(async () => {
  await sql.end();
});

describe('URL safety', () => {
  it('normalises the URL so duplicates can be detected', async () => {
    // กรอกโดเมนตัวใหญ่และไม่มี / ท้าย
    const link = await createOk(alice, { url: 'HTTPS://WWW.Synerry.com' });
    // ต้องถูกแปลงเป็นรูปแบบมาตรฐาน
    expect(link.originalUrl).toBe('https://www.synerry.com/');
  });

  it.each([
    // บริการย่อลิงก์อื่น
    ['another shortener', 'https://bit.ly/abc'],
    // subdomain ของโดเมนที่ถูกบล็อก
    ['a subdomain of a blocked domain', 'https://evil.bit.ly/x'],
    // โดเมนตัวอย่างที่ใส่ไว้ในรายการบล็อก
    ['a known unsafe domain', 'https://login.phishing.example/'],
    // ซ่อนปลายทางจริงด้วยชื่อผู้ใช้ใน URL
    ['a URL with a username trick', 'https://www.bank.com@evil.test/'],
  ])('rejects %s', async (_name, url) => {
    // ส่ง URL
    const res = await create(alice, { url });
    // ต้องได้ 400 ที่ช่อง url
    expect(res.status).toBe(400);
    expect((await json(res)).error.details[0].field).toBe('url');
  });

  it('marks a link as blocked in the internal lookup if its domain is on the list', async () => {
    // จำลองลิงก์เก่าที่สร้างก่อนโดเมนจะถูกบล็อก โดยใส่ลงฐานข้อมูลตรงๆ
    const [u] = await db.select().from(users).where(eq(users.username, 'alice'));
    await db.insert(links).values({ userId: u.id, originalUrl: 'https://bit.ly/old', shortCode: 'oldone' });
    // redirect ค้นลิงก์
    const res = await json(await send('GET', '/internal/links/oldone', { headers: INTERNAL }));
    // ต้องบอกว่าถูกบล็อก เพื่อให้ redirect ไม่พาไป
    expect(res.blocked).toBe(true);
  });
});

describe('tags', () => {
  it('stores tags without duplicates, lists them with counts, and filters the history', async () => {
    // สร้างลิงก์ที่มีแท็ก (มีตัวซ้ำต่างตัวพิมพ์ และภาษาไทย)
    const a = await createOk(alice, { url: 'https://a.example.com', tags: ['Marketing', 'marketing', 'ตุลาคม'] });
    await createOk(alice, { url: 'https://b.example.com', tags: ['Marketing'] });
    await createOk(alice, { url: 'https://c.example.com' });
    // แท็กซ้ำต้องถูกตัด เหลือตัวแรก
    expect(a.tags).toEqual(['Marketing', 'ตุลาคม']);
    // รายชื่อแท็กพร้อมจำนวน เรียงจากมากไปน้อย
    const tags = (await json(await send('GET', '/api/links/tags', { cookie: alice }))).tags;
    expect(tags).toEqual([{ name: 'Marketing', count: 2 }, { name: 'ตุลาคม', count: 1 }]);
    // กรองประวัติด้วยแท็ก
    const list = await json(await send('GET', `/api/links?tag=${encodeURIComponent('ตุลาคม')}`, { cookie: alice }));
    expect(list.items.map((l: { id: number }) => l.id)).toEqual([a.id]);
  });

  it('rejects more than 10 tags', async () => {
    // ส่ง 11 แท็ก
    const res = await create(alice, { url: 'https://a.example.com', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) });
    expect(res.status).toBe(400);
  });
});

describe('start date (scheduled links)', () => {
  it('shows a future start date as "scheduled", and gives redirect the start date', async () => {
    // สร้างลิงก์ที่เริ่มใช้พรุ่งนี้
    const link = await createOk(alice, { url: 'https://a.example.com', alias: 'soon', startsAt: hoursFromNow(24) });
    // สถานะต้องเป็นรอเริ่ม
    expect(link.status).toBe('scheduled');
    // redirect ต้องได้วันเริ่มไปตรวจ
    const internal = await json(await send('GET', '/internal/links/soon', { headers: INTERNAL }));
    expect(internal.startsAt).toBe(link.startsAt);
  });

  it('requires the start date to be before the expiry, on create and on edit', async () => {
    // สร้างโดยวันเริ่มหลังวันหมดอายุ
    const bad = await create(alice, { url: 'https://a.example.com', startsAt: hoursFromNow(48), expiresAt: hoursFromNow(24) });
    expect(bad.status).toBe(400);
    // สร้างแบบถูกต้อง แล้วแก้วันเริ่มให้เลยวันหมดอายุ
    const link = await createOk(alice, { url: 'https://a.example.com', expiresAt: hoursFromNow(24) });
    const edit = await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: { startsAt: hoursFromNow(48) } });
    expect(edit.status).toBe(400);
  });
});

describe('duplicate check', () => {
  it('finds my existing links to the same URL, including older ones saved without a trailing slash', async () => {
    // ลิงก์เก่าที่บันทึกก่อนมีการแปลงรูปแบบ (ไม่มี / ท้าย) ใส่ลงฐานข้อมูลตรงๆ
    const [u] = await db.select().from(users).where(eq(users.username, 'alice'));
    await db.insert(links).values({ userId: u.id, originalUrl: 'https://www.synerry.com', shortCode: 'legacy' });
    // ลิงก์ใหม่ของ alice
    await createOk(alice, { url: 'https://www.synerry.com/' });
    // ลิงก์ของ bob ต้องไม่ถูกนับ
    await createOk(bob, { url: 'https://www.synerry.com/' });
    // ถามด้วยตัวพิมพ์ใหญ่
    const res = await json(await send('GET', `/api/links/duplicates?url=${encodeURIComponent('HTTPS://www.synerry.COM')}`, { cookie: alice }));
    // ต้องเจอ 2 ลิงก์ของ alice
    expect(res.items).toHaveLength(2);
  });
});

describe('trash', () => {
  it('moves a link to trash, restores it, then deletes it permanently', async () => {
    // สร้างลิงก์
    const link = await createOk(alice, { url: 'https://a.example.com', alias: 'mylink' });
    // ย้ายลงถังขยะ
    expect((await send('DELETE', `/api/links/${link.id}`, { cookie: alice })).status).toBe(204);
    // ต้องหายจากประวัติ
    expect((await json(await send('GET', '/api/links', { cookie: alice }))).total).toBe(0);
    // redirect ต้องหาไม่เจอ
    expect((await send('GET', '/internal/links/mylink', { headers: INTERNAL })).status).toBe(404);
    // ต้องอยู่ในถังขยะ
    const trash = await json(await send('GET', '/api/links/trash', { cookie: alice }));
    expect(trash.items.map((l: { id: number }) => l.id)).toEqual([link.id]);
    expect(trash.retentionDays).toBe(30);
    // alias ยังถูกจองไว้ คนอื่นเอาไปใช้ไม่ได้ระหว่างอยู่ในถังขยะ
    expect((await create(bob, { url: 'https://evil.example.com', alias: 'mylink' })).status).toBe(409);
    // bob กู้คืนลิงก์ของ alice ไม่ได้
    expect((await send('POST', `/api/links/${link.id}/restore`, { cookie: bob })).status).toBe(404);
    // alice กู้คืน
    expect((await send('POST', `/api/links/${link.id}/restore`, { cookie: alice })).status).toBe(200);
    // กลับมาใช้ได้
    expect((await send('GET', '/internal/links/mylink', { headers: INTERNAL })).status).toBe(200);
    // ลบถาวร
    expect((await send('DELETE', `/api/links/${link.id}/permanent`, { cookie: alice })).status).toBe(204);
    // หายจากถังขยะด้วย
    expect((await json(await send('GET', '/api/links/trash', { cookie: alice }))).items).toHaveLength(0);
  });

  it('permanently removes links that have been in the trash longer than 30 days', async () => {
    // สร้างลิงก์สองตัวแล้วลบทั้งคู่
    const old = await createOk(alice, { url: 'https://old.example.com' });
    const recent = await createOk(alice, { url: 'https://new.example.com' });
    await send('DELETE', `/api/links/${old.id}`, { cookie: alice });
    await send('DELETE', `/api/links/${recent.id}`, { cookie: alice });
    // ย้อนเวลาที่ลบของลิงก์แรกไป 31 วัน
    await db.update(links).set({ deletedAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(links.id, old.id));
    // เปิดถังขยะ
    const trash = await json(await send('GET', '/api/links/trash', { cookie: alice }));
    // เหลือเฉพาะตัวที่ลบล่าสุด
    expect(trash.items.map((l: { id: number }) => l.id)).toEqual([recent.id]);
    // ตัวเก่าต้องหายจากฐานข้อมูลจริง
    expect(await db.select().from(links).where(eq(links.id, old.id))).toHaveLength(0);
  });
});

describe('GET /api/links/export.xlsx', () => {
  it('downloads a real Excel file with only my links', async () => {
    // สร้างลิงก์ของ alice ที่มีชื่อเป็นสูตร และของ bob
    await createOk(alice, { url: 'https://www.synerry.com', title: '=1+1', tags: ['ทดสอบ'] });
    await createOk(bob, { url: 'https://bob.example.com' });
    // ดาวน์โหลด
    const res = await send('GET', '/api/links/export.xlsx', { cookie: alice });
    // ต้องเป็นไฟล์ Excel
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    // เปิดไฟล์ด้วย exceljs
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    // อ่าน sheet แรก
    const ws = wb.getWorksheet('Links')!;
    // หัวตาราง + ลิงก์ของ alice 1 แถว
    expect(ws.rowCount).toBe(2);
    // ชื่อที่เป็นสูตรต้องถูกเก็บเป็นข้อความธรรมดา ไม่ใช่สูตร
    expect(ws.getCell('C2').value).toBe('=1+1');
    expect(ws.getCell('C2').formula).toBeUndefined();
    // แท็กภาษาไทย
    expect(ws.getCell('D2').value).toBe('ทดสอบ');
  });
});
