// นำเข้าฟังก์ชันของ vitest สำหรับเขียน test
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// นำเข้าตัวสร้างเงื่อนไข query
import { eq } from 'drizzle-orm';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from '../app';
// นำเข้า connection ฐานข้อมูล (ต่อกับฐานข้อมูล test)
import { db, sql } from '../db/client';
// นำเข้านิยามตาราง
import { sessions, users } from '../db/schema';
// นำเข้าตัวโหลด blocklist
import { refreshBlocklist } from '../links/blocklist';
// นำเข้าตัวช่วยที่ใช้ร่วมกันระหว่างไฟล์ test
import * as h from '../../test/helpers';
// นำเข้าตัวช่วยอ่าน JSON และสมัครผู้ใช้
import { json, registerAndLogin } from '../../test/helpers';

// ตัวแปรเก็บ app และ cookie
let app: ReturnType<typeof createApp>;
let admin: string;
let alice: string;
// รหัสผู้ใช้ alice
let aliceId: number;

// ส่ง request ไปที่ app ของ test ปัจจุบัน
const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
// header ของ route ภายใน
const INTERNAL = { 'x-internal-key': 'test-internal-key' };

// ก่อนแต่ละ test: ล้างข้อมูล สร้างผู้ดูแลหนึ่งคนและผู้ใช้หนึ่งคน
beforeEach(async () => {
  // ล้างทุกตาราง รวม blocklist
  await sql`truncate users, links, sessions, blocked_domains restart identity cascade`;
  // โหลด blocklist ใหม่ (ว่าง) เข้าหน่วยความจำ
  await refreshBlocklist();
  // สร้าง app ใหม่
  app = createApp();
  // สมัครผู้ใช้ชื่อ boss แล้วยกเป็นผู้ดูแลในฐานข้อมูล (สมัครผ่านหน้าเว็บได้แค่ user เท่านั้น)
  admin = await registerAndLogin(app, 'boss');
  await db.update(users).set({ role: 'admin' }).where(eq(users.username, 'boss'));
  // สมัครผู้ใช้ทั่วไป
  alice = await registerAndLogin(app, 'alice');
  // เก็บรหัสของ alice
  [{ id: aliceId }] = await db.select({ id: users.id }).from(users).where(eq(users.username, 'alice'));
});

// หลัง test ทั้งหมดเสร็จ ปิด connection pool
afterAll(async () => {
  await sql.end();
});

describe('access control', () => {
  it('hides every admin route from normal users with 404, and from guests with 401', async () => {
    // ผู้ใช้ทั่วไป
    for (const path of ['/api/admin/summary', '/api/admin/users', '/api/admin/links', '/api/admin/blocklist']) {
      expect((await send('GET', path, { cookie: alice })).status).toBe(404);
    }
    // ยังไม่ login
    expect((await send('GET', '/api/admin/summary')).status).toBe(401);
    // ผู้ดูแลเข้าได้
    expect((await send('GET', '/api/admin/summary', { cookie: admin })).status).toBe(200);
  });

  it('reports the role in /me so the web app can show the admin menu', async () => {
    // ผู้ดูแล
    expect((await json(await send('GET', '/api/auth/me', { cookie: admin }))).user.role).toBe('admin');
    // ผู้ใช้ทั่วไป
    expect((await json(await send('GET', '/api/auth/me', { cookie: alice }))).user.role).toBe('user');
  });

  it('never lets someone register as an admin', async () => {
    // พยายามส่ง role มาตอนสมัคร
    const res = await send('POST', '/api/auth/register', { body: { username: 'sneaky', password: 'Password123', role: 'admin' } });
    // สมัครได้ แต่เป็นผู้ใช้ทั่วไป
    expect((await json(res)).user.role).toBe('user');
  });
});

describe('suspending users', () => {
  it('logs the user out everywhere, blocks login, and stops all their links', async () => {
    // alice สร้างลิงก์
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://example.com', alias: 'alice-link' } });
    // ผู้ดูแลระงับ alice
    const res = await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: false } });
    expect(res.status).toBe(200);
    // session ทั้งหมดของ alice ถูกลบ
    expect(await db.select().from(sessions).where(eq(sessions.userId, aliceId))).toHaveLength(0);
    // cookie เดิมใช้ไม่ได้
    expect((await send('GET', '/api/auth/me', { cookie: alice })).status).toBe(401);
    // login ใหม่ด้วยรหัสที่ถูก ได้ 403 พร้อมเหตุผล
    const login = await send('POST', '/api/auth/login', { body: { username: 'alice', password: 'Password123' } });
    expect(login.status).toBe(403);
    expect((await json(login)).error.code).toBe('account_suspended');
    // ลิงก์ของ alice ใช้ไม่ได้ (redirect จะได้ isActive เป็น false)
    expect((await json(await send('GET', '/internal/links/alice-link', { headers: INTERNAL }))).isActive).toBe(false);
    // เปิดบัญชีคืน ลิงก์กลับมาใช้ได้
    await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: true } });
    expect((await json(await send('GET', '/internal/links/alice-link', { headers: INTERNAL }))).isActive).toBe(true);
  });

  it('refuses to suspend yourself or another admin', async () => {
    // รหัสของผู้ดูแล
    const [{ id: bossId }] = await db.select({ id: users.id }).from(users).where(eq(users.username, 'boss'));
    // ระงับตัวเอง
    expect((await send('PATCH', `/api/admin/users/${bossId}`, { cookie: admin, body: { isActive: false } })).status).toBe(400);
    // ยก alice เป็นผู้ดูแล แล้วลองระงับ
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, aliceId));
    expect((await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: false } })).status).toBe(400);
  });

  it('lists users with their link counts and supports search', async () => {
    // alice สร้างสองลิงก์
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://a.example.com' } });
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://b.example.com' } });
    // ค้นชื่อ ali
    const list = await json(await send('GET', '/api/admin/users?q=ali', { cookie: admin }));
    // เจอ alice คนเดียว พร้อมจำนวนลิงก์ และไม่มี password hash
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ username: 'alice', linkCount: 2, isActive: true, role: 'user' });
    expect(JSON.stringify(list)).not.toContain('password');
  });
});

describe('locking links', () => {
  it('locks a link with a reason, the owner cannot re-enable it, and unlocking restores it', async () => {
    // alice สร้างลิงก์
    const { link } = await json(await send('POST', '/api/links', { cookie: alice, body: { url: 'https://example.com', alias: 'suspect' } }));
    // ระงับโดยไม่ใส่เหตุผล ไม่ได้
    expect((await send('POST', `/api/admin/links/${link.id}/lock`, { cookie: admin, body: {} })).status).toBe(400);
    // ระงับพร้อมเหตุผล
    const locked = await json(await send('POST', `/api/admin/links/${link.id}/lock`, { cookie: admin, body: { reason: 'Reported as phishing' } }));
    expect(locked.link.status).toBe('locked');
    // เจ้าของเห็นสถานะและเหตุผล
    const own = await json(await send('GET', `/api/links/${link.id}`, { cookie: alice }));
    expect(own.link).toMatchObject({ status: 'locked', lockReason: 'Reported as phishing' });
    // เจ้าของพยายามเปิดเอง ได้ 403
    const reopen = await send('PATCH', `/api/links/${link.id}`, { cookie: alice, body: { isActive: true } });
    expect(reopen.status).toBe(403);
    // redirect ใช้ไม่ได้
    expect((await json(await send('GET', '/internal/links/suspect', { headers: INTERNAL }))).isActive).toBe(false);
    // ผู้ใช้ทั่วไปใช้ route ระงับไม่ได้
    expect((await send('POST', `/api/admin/links/${link.id}/unlock`, { cookie: alice })).status).toBe(404);
    // ผู้ดูแลยกเลิกการระงับ
    await send('POST', `/api/admin/links/${link.id}/unlock`, { cookie: admin });
    expect((await json(await send('GET', '/internal/links/suspect', { headers: INTERNAL }))).isActive).toBe(true);
  });

  it('lists everyone\'s links with owner names, and filters locked ones', async () => {
    // alice สร้างสองลิงก์ แล้วถูกระงับหนึ่งลิงก์
    const { link } = await json(await send('POST', '/api/links', { cookie: alice, body: { url: 'https://a.example.com' } }));
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://b.example.com' } });
    await send('POST', `/api/admin/links/${link.id}/lock`, { cookie: admin, body: { reason: 'Spam' } });
    // ทั้งหมด
    const all = await json(await send('GET', '/api/admin/links', { cookie: admin }));
    expect(all.total).toBe(2);
    expect(all.items[0].owner).toBe('alice');
    // เฉพาะที่ถูกระงับ
    const locked = await json(await send('GET', '/api/admin/links?filter=locked', { cookie: admin }));
    expect(locked.items.map((l: { id: number }) => l.id)).toEqual([link.id]);
    // ค้นจากชื่อเจ้าของ
    expect((await json(await send('GET', '/api/admin/links?q=alice', { cookie: admin }))).total).toBe(2);
  });
});

describe('blocklist management', () => {
  it('adds a domain (from a pasted URL too), which blocks new links and old ones immediately, then removes it', async () => {
    // alice สร้างลิงก์ก่อนที่โดเมนจะถูกบล็อก
    await send('POST', '/api/links', { cookie: alice, body: { url: 'https://bad-site.test/page', alias: 'oldbad' } });
    // ผู้ดูแลเพิ่มโดยวาง URL เต็ม
    const add = await send('POST', '/api/admin/blocklist', { cookie: admin, body: { url: '', domain: 'https://Bad-Site.test/login', reason: 'Phishing' } });
    expect(add.status).toBe(201);
    const { item } = await json(add);
    // เก็บเฉพาะชื่อโดเมน ตัวเล็ก
    expect(item.domain).toBe('bad-site.test');
    // สร้างลิงก์ใหม่ไปโดเมนนี้ (และ subdomain) ไม่ได้
    expect((await send('POST', '/api/links', { cookie: alice, body: { url: 'https://www.bad-site.test/x' } })).status).toBe(400);
    // ลิงก์เก่าถูกบล็อกตอน redirect ทันที
    expect((await json(await send('GET', '/internal/links/oldbad', { headers: INTERNAL }))).blocked).toBe(true);
    // เพิ่มซ้ำ ได้ 409
    expect((await send('POST', '/api/admin/blocklist', { cookie: admin, body: { domain: 'bad-site.test' } })).status).toBe(409);
    // ลบออก
    expect((await send('DELETE', `/api/admin/blocklist/${item.id}`, { cookie: admin })).status).toBe(204);
    // สร้างลิงก์ได้อีกครั้ง
    expect((await send('POST', '/api/links', { cookie: alice, body: { url: 'https://www.bad-site.test/x' } })).status).toBe(201);
  });

  it('rejects things that are not domains, and shows the built-in list', async () => {
    // ไม่ใช่ชื่อโดเมน
    expect((await send('POST', '/api/admin/blocklist', { cookie: admin, body: { domain: 'not a domain' } })).status).toBe(400);
    // รายการของระบบ
    const list = await json(await send('GET', '/api/admin/blocklist', { cookie: admin }));
    expect(list.builtIn).toContain('bit.ly');
    // เพิ่มโดเมนที่อยู่ในรายการระบบแล้ว ได้ 409
    expect((await send('POST', '/api/admin/blocklist', { cookie: admin, body: { domain: 'bit.ly' } })).status).toBe(409);
  });
});

describe('summary', () => {
  it('counts users, suspended users, links and locked links', async () => {
    // alice สร้างลิงก์ แล้วลิงก์ถูกระงับ และ alice ถูกระงับ
    const { link } = await json(await send('POST', '/api/links', { cookie: alice, body: { url: 'https://a.example.com' } }));
    await send('POST', `/api/admin/links/${link.id}/lock`, { cookie: admin, body: { reason: 'Spam' } });
    await send('PATCH', `/api/admin/users/${aliceId}`, { cookie: admin, body: { isActive: false } });
    // ขอสรุป
    const s = await json(await send('GET', '/api/admin/summary', { cookie: admin }));
    // ผู้ใช้ 2 คน ถูกระงับ 1 ลิงก์ 1 ถูกระงับ 1
    expect(s).toMatchObject({ users: 2, suspendedUsers: 1, links: 1, lockedLinks: 1, linksLast7Days: 1 });
  });
});

