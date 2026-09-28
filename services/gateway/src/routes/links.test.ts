// นำเข้าฟังก์ชันของ vitest สำหรับเขียน test
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from '../app';
// นำเข้า connection ฐานข้อมูล (ต่อกับฐานข้อมูล test)
import { sql } from '../db/client';
// นำเข้าตัวช่วยที่ใช้ร่วมกันระหว่างไฟล์ test
import * as h from '../../test/helpers';
// นำเข้าตัวช่วยอ่าน JSON และสมัครผู้ใช้
import { json, registerAndLogin } from '../../test/helpers';

// ตัวแปรเก็บ app ที่สร้างใหม่ก่อนแต่ละ test
let app: ReturnType<typeof createApp>;
// cookie ของผู้ใช้สองคน ใช้ทดสอบเรื่องสิทธิ์ความเป็นเจ้าของ
let alice: string;
let bob: string;

// ส่ง request ไปที่ app ของ test ปัจจุบัน
const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
// สร้างลิงก์ในนามผู้ใช้ที่ระบุ
const create = (cookie: string, body: Record<string, unknown>) => send('POST', '/api/links', { cookie, body });

// ก่อนแต่ละ test ล้างข้อมูล สร้าง app ใหม่ และสมัครผู้ใช้สองคน
beforeEach(async () => {
  // ลบข้อมูลทุกตาราง และรีเซ็ตเลข id
  await sql`truncate users, links, sessions restart identity cascade`;
  // สร้าง app ใหม่
  app = createApp();
  // สมัครผู้ใช้ alice และ bob
  alice = await registerAndLogin(app, 'alice');
  bob = await registerAndLogin(app, 'bob');
});

// หลัง test ทั้งหมดเสร็จ ปิด connection pool
afterAll(async () => {
  await sql.end();
});

describe('POST /api/links', () => {
  it('creates a link with a random 6-character code and a full short URL', async () => {
    // สร้างลิงก์ตามตัวอย่างในโจทย์
    const res = await create(alice, { url: 'https://www.synerry.com' });
    // ต้องได้ 201
    expect(res.status).toBe(201);
    // อ่านข้อมูลลิงก์
    const { link } = await json(res);
    // รหัสต้องเป็นตัวอักษรหรือตัวเลข 6 ตัว
    expect(link.shortCode).toMatch(/^[A-Za-z0-9]{6}$/);
    // ลิงก์สั้นต้องประกอบจากโดเมนของ redirect service และรหัส
    expect(link.shortUrl).toBe(`http://localhost:3002/${link.shortCode}`);
    // สถานะเริ่มต้นต้องใช้งานได้
    expect(link.status).toBe('active');
    // ต้องไม่ส่งรหัสเจ้าของออกไป
    expect(link.userId).toBeUndefined();
  });

  it('uses a custom alias and rejects the same alias from anyone with 409', async () => {
    // alice ตั้ง alias
    const first = await create(alice, { url: 'https://www.synerry.com', alias: 'synerry-home' });
    expect(first.status).toBe(201);
    expect((await json(first)).link.shortCode).toBe('synerry-home');
    // bob ใช้ alias เดียวกัน ต้องไม่ได้
    const dup = await create(bob, { url: 'https://example.com', alias: 'synerry-home' });
    expect(dup.status).toBe(409);
    expect((await json(dup)).error.code).toBe('alias_taken');
  });

  it.each([
    // URL อันตรายที่รันสคริปต์ได้
    ['javascript URL', { url: 'javascript:alert(1)' }, 'url'],
    // ไม่ใช่ URL
    ['not a URL', { url: 'hello world' }, 'url'],
    // ลิงก์สั้นของเราเอง จะทำให้ redirect วน
    ['our own short domain', { url: 'http://localhost:3002/abc123' }, 'url'],
    // คำที่จองไว้
    ['reserved alias', { url: 'https://example.com', alias: 'API' }, 'alias'],
    // alias มีตัวอักษรที่ไม่อนุญาต
    ['alias with spaces', { url: 'https://example.com', alias: 'my link' }, 'alias'],
    // วันหมดอายุในอดีต
    ['expiry in the past', { url: 'https://example.com', expiresAt: '2020-01-01T00:00:00Z' }, 'expiresAt'],
  ])('rejects %s with 400 on the right field', async (_name, body, field) => {
    // ส่งข้อมูลที่ไม่ถูกต้อง
    const res = await create(alice, body);
    // ต้องได้ 400
    expect(res.status).toBe(400);
    // ต้องบอกว่าผิดที่ช่องที่ถูกต้อง
    const fields = (await json(res)).error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain(field);
  });

  it('ignores a userId in the body, so nobody can create links for another user', async () => {
    // alice พยายามสร้างลิงก์ในนามผู้ใช้ id 2 (bob)
    const res = await create(alice, { url: 'https://example.com', userId: 2 });
    expect(res.status).toBe(201);
    // bob ต้องไม่เห็นลิงก์นี้ในประวัติของตัวเอง
    const list = await json(await send('GET', '/api/links', { cookie: bob }));
    expect(list.total).toBe(0);
  });

  it('requires login', async () => {
    // ไม่แนบ cookie
    const res = await send('POST', '/api/links', { body: { url: 'https://example.com' } });
    // ต้องได้ 401
    expect(res.status).toBe(401);
  });
});

describe('GET /api/links (history)', () => {
  it('lists only my links, newest first, with pagination and search', async () => {
    // alice สร้าง 3 ลิงก์ ทีละตัวตามลำดับ
    await create(alice, { url: 'https://a.example.com', title: 'First' });
    await create(alice, { url: 'https://b.example.com', title: '100% Second' });
    await create(alice, { url: 'https://c.example.com', title: 'Third' });
    // bob สร้าง 1 ลิงก์
    await create(bob, { url: 'https://bob.example.com' });

    // หน้าแรก หน้าละ 2 รายการ
    const page1 = await json(await send('GET', '/api/links?page=1&pageSize=2', { cookie: alice }));
    // ต้องนับได้ 3 (ไม่รวมของ bob)
    expect(page1.total).toBe(3);
    // หน้าแรกต้องได้ 2 รายการ เรียงจากใหม่ไปเก่า
    expect(page1.items.map((l: { title: string }) => l.title)).toEqual(['Third', '100% Second']);

    // ค้นด้วยเครื่องหมาย % ต้องถือเป็นตัวอักษรธรรมดา ไม่ใช่ wildcard
    const search = await json(await send('GET', '/api/links?q=100%25', { cookie: alice }));
    expect(search.items.map((l: { title: string }) => l.title)).toEqual(['100% Second']);
  });
});

describe('ownership: another user cannot see or change my link', () => {
  it('returns 404 for GET, PATCH and DELETE on another user\'s link, and the link survives', async () => {
    // alice สร้างลิงก์
    const { link } = await json(await create(alice, { url: 'https://www.synerry.com' }));
    // bob พยายามดู แก้ และลบ
    expect((await send('GET', `/api/links/${link.id}`, { cookie: bob })).status).toBe(404);
    expect((await send('PATCH', `/api/links/${link.id}`, { cookie: bob, body: { isActive: false } })).status).toBe(404);
    expect((await send('DELETE', `/api/links/${link.id}`, { cookie: bob })).status).toBe(404);
    // ลิงก์ของ alice ต้องยังอยู่และยังใช้งานได้
    const still = await json(await send('GET', `/api/links/${link.id}`, { cookie: alice }));
    expect(still.link.status).toBe('active');
  });
});

describe('PATCH and DELETE /api/links/:id', () => {
  it('updates title, disables the link, then clears the expiry', async () => {
    // สร้างลิงก์ที่มีวันหมดอายุ
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const { link } = await json(await create(alice, { url: 'https://example.com', expiresAt: future }));
    // แก้ชื่อและปิดใช้งาน
    const res = await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: { title: 'Renamed', isActive: false } });
    const updated = (await json(res)).link;
    expect(updated.title).toBe('Renamed');
    expect(updated.status).toBe('disabled');
    // ยกเลิกวันหมดอายุด้วยค่า null
    const cleared = (await json(await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: { expiresAt: null } }))).link;
    expect(cleared.expiresAt).toBeNull();
  });

  it('rejects an empty update with 400', async () => {
    // สร้างลิงก์
    const { link } = await json(await create(alice, { url: 'https://example.com' }));
    // ส่ง body ว่าง
    expect((await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: {} })).status).toBe(400);
  });

  it('deletes my link', async () => {
    // สร้างลิงก์
    const { link } = await json(await create(alice, { url: 'https://example.com' }));
    // ลบ ต้องได้ 204
    expect((await send('DELETE', `/api/links/${link.id}`, { cookie: alice })).status).toBe(204);
    // หาอีกครั้ง ต้องไม่พบ
    expect((await send('GET', `/api/links/${link.id}`, { cookie: alice })).status).toBe(404);
  });
});

describe('GET /internal/links/:code (used by the redirect service)', () => {
  it('requires the correct internal key', async () => {
    // สร้างลิงก์
    await create(alice, { url: 'https://www.synerry.com', alias: 'synerry' });
    // ไม่มี key
    expect((await send('GET', '/internal/links/synerry')).status).toBe(401);
    // key ผิด
    expect((await send('GET', '/internal/links/synerry', { headers: { 'x-internal-key': 'wrong' } })).status).toBe(401);
    // session cookie ของผู้ใช้ก็ใช้แทน key ไม่ได้
    expect((await send('GET', '/internal/links/synerry', { cookie: alice })).status).toBe(401);
  });

  it('returns only the fields redirect needs, and 404 for an unknown code', async () => {
    // สร้างลิงก์
    await create(alice, { url: 'https://www.synerry.com', alias: 'synerry' });
    // header ที่มี key ถูกต้อง
    const headers = { 'x-internal-key': 'test-internal-key' };
    // ค้นลิงก์ที่มีอยู่
    const res = await send('GET', '/internal/links/synerry', { headers });
    expect(res.status).toBe(200);
    // ต้องได้เฉพาะฟิลด์ที่ redirect ใช้ ไม่มีข้อมูลเจ้าของ
    expect(Object.keys(await json(res)).sort()).toEqual(['blocked', 'expiresAt', 'id', 'isActive', 'originalUrl', 'startsAt']);
    // ค้นรหัสที่ไม่มี ต้องได้ 404
    expect((await send('GET', '/internal/links/nope99', { headers })).status).toBe(404);
  });
});

describe('GET /api/links/export.csv', () => {
  it('downloads only my links as UTF-8 CSV with a BOM, and neutralises spreadsheet formulas', async () => {
    // alice สร้างลิงก์ที่ชื่อเป็นภาษาไทยและมีเครื่องหมาย , และ "
    await create(alice, { url: 'https://www.synerry.com', title: 'ซินเนอร์รี่, "ทดสอบ"' });
    // alice สร้างลิงก์ที่ชื่อขึ้นต้นด้วย = ซึ่ง Excel จะอ่านเป็นสูตร
    await create(alice, { url: 'https://example.com', title: '=HYPERLINK("http://evil.example")' });
    // bob สร้างลิงก์ ต้องไม่อยู่ในไฟล์ของ alice
    await create(bob, { url: 'https://bob.example.com' });

    // ดาวน์โหลดไฟล์
    const res = await send('GET', '/api/links/export.csv', { cookie: alice });
    // ต้องได้ 200 และเป็นไฟล์แนบ CSV
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="synerry-links-\d{4}-\d{2}-\d{2}\.csv"/);
    // อ่านเนื้อหาไฟล์แบบ byte เพื่อตรวจ BOM (res.text() จะตัด BOM ทิ้งให้อัตโนมัติ)
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    // แปลงเป็นข้อความโดยไม่ตัด BOM
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    // แยกเป็นบรรทัด
    const lines = text.trim().split('\r\n');
    // หัวตาราง + 2 แถวของ alice เท่านั้น
    expect(lines).toHaveLength(3);
    // ชื่อภาษาไทยที่มี , และ " ต้องถูกครอบด้วย " และ " ข้างในเป็น ""
    expect(text).toContain('"ซินเนอร์รี่, ""ทดสอบ"""');
    // ชื่อที่ขึ้นต้นด้วย = ต้องถูกใส่ ' นำหน้า
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"")"`);
    // ต้องไม่มีลิงก์ของ bob
    expect(text).not.toContain('bob.example.com');
  });

  it('is not mistaken for a link id', async () => {
    // ถ้าประกาศ route ผิดลำดับ export.csv จะถูกมองเป็น /:id และได้ 404
    expect((await send('GET', '/api/links/export.csv', { cookie: alice })).status).toBe(200);
  });
});
