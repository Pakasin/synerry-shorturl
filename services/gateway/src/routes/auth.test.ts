// นำเข้าฟังก์ชันของ vitest สำหรับเขียน test
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// นำเข้าตัวสร้างเงื่อนไข query
import { eq } from 'drizzle-orm';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from '../app';
// นำเข้า connection ฐานข้อมูล (ต่อกับฐานข้อมูล test ตามที่ vitest.config.ts ตั้งไว้)
import { db, sql } from '../db/client';
// นำเข้านิยามตาราง
import { sessions } from '../db/schema';
// นำเข้าฟังก์ชัน hash token
import { hashToken } from '../auth/session';

// นำเข้าตัวช่วยที่ใช้ร่วมกันระหว่างไฟล์ test
import * as h from '../../test/helpers';
// นำเข้าตัวช่วยอ่าน cookie และ JSON
import { json, sidCookie } from '../../test/helpers';

// ตัวแปรเก็บ app ที่สร้างใหม่ก่อนแต่ละ test
let app: ReturnType<typeof createApp>;

// ส่ง request ไปที่ app ของ test ปัจจุบัน
const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);

// ข้อมูลผู้ใช้ตัวอย่างสำหรับ test
const alice = { username: 'alice', password: 'Password123' };

// ก่อนแต่ละ test ล้างข้อมูลทั้งหมดและสร้าง app ใหม่ (rate limit จะเริ่มนับใหม่ด้วย)
beforeEach(async () => {
  // ลบข้อมูลทุกตาราง และรีเซ็ตเลข id
  await sql`truncate users, links, sessions restart identity cascade`;
  // สร้าง app ใหม่
  app = createApp();
});

// หลัง test ทั้งหมดเสร็จ ปิด connection pool
afterAll(async () => {
  await sql.end();
});

describe('POST /api/auth/register', () => {
  it('creates the user, sets an HttpOnly session cookie, and logs in', async () => {
    // สมัครสมาชิก
    const res = await send('POST', '/api/auth/register', { body: alice });
    // ต้องได้ 201
    expect(res.status).toBe(201);
    // ข้อมูลที่ตอบกลับต้องมีชื่อผู้ใช้ และต้องไม่มี password hash
    const body = await json(res);
    expect(body.user.username).toBe('alice');
    expect(JSON.stringify(body)).not.toContain('password');
    // cookie ต้องเป็น HttpOnly และ SameSite=Lax
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^sid=/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    // ใช้ cookie ที่ได้เรียก /me ต้องได้ผู้ใช้คนเดิม
    const me = await send('GET', '/api/auth/me', { cookie: sidCookie(res) });
    expect(me.status).toBe(200);
    expect((await json(me)).user.username).toBe('alice');
  });

  it('rejects a duplicate username with 409, case-insensitive', async () => {
    // สมัครครั้งแรก
    await send('POST', '/api/auth/register', { body: alice });
    // สมัครซ้ำด้วยชื่อเดิมแต่ตัวพิมพ์ใหญ่
    const res = await send('POST', '/api/auth/register', { body: { ...alice, username: 'ALICE' } });
    // ต้องได้ 409
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('username_taken');
  });

  it('rejects invalid input with 400 and field details', async () => {
    // ชื่อสั้นเกินและรหัสผ่านสั้นเกิน
    const res = await send('POST', '/api/auth/register', { body: { username: 'a!', password: '123' } });
    // ต้องได้ 400
    expect(res.status).toBe(400);
    // ต้องบอกว่าผิดที่ฟิลด์ไหนบ้าง
    const fields = (await json(res)).error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain('username');
    expect(fields).toContain('password');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    // สมัครก่อน
    await send('POST', '/api/auth/register', { body: alice });
    // login
    const res = await send('POST', '/api/auth/login', { body: alice });
    // ต้องได้ 200 และมี cookie
    expect(res.status).toBe(200);
    expect(sidCookie(res)).toMatch(/^sid=.+/);
  });

  it('returns the same 401 message for a wrong password and an unknown user', async () => {
    // สมัครก่อน
    await send('POST', '/api/auth/register', { body: alice });
    // รหัสผ่านผิด
    const wrongPass = await send('POST', '/api/auth/login', { body: { ...alice, password: 'WrongPass999' } });
    // ไม่มีผู้ใช้นี้
    const noUser = await send('POST', '/api/auth/login', { body: { username: 'nobody', password: 'Password123' } });
    // ทั้งสองแบบต้องได้ 401
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    // และข้อความต้องเหมือนกันทุกตัวอักษร เพื่อไม่ให้เดาได้ว่าชื่อไหนมีอยู่จริง
    expect(await json(wrongPass)).toEqual(await json(noUser));
  });

  it('stores only the sha256 hash of the token, never the raw token', async () => {
    // สมัครและได้ cookie
    const res = await send('POST', '/api/auth/register', { body: alice });
    // แยก token ดิบออกจาก cookie
    const token = sidCookie(res).slice('sid='.length);
    // ค้นในฐานข้อมูลด้วย token ดิบ ต้องไม่เจอ
    expect(await db.select().from(sessions).where(eq(sessions.id, token))).toHaveLength(0);
    // ค้นด้วย hash ต้องเจอหนึ่งแถว
    expect(await db.select().from(sessions).where(eq(sessions.id, hashToken(token)))).toHaveLength(1);
  });

  it('rate-limits after 10 attempts with 429', async () => {
    // ส่ง login ผิด 10 ครั้ง ซึ่งยังอยู่ในขีดจำกัด
    for (let i = 0; i < 10; i++) {
      await send('POST', '/api/auth/login', { body: { username: 'nobody', password: 'Password123' } });
    }
    // ครั้งที่ 11 ต้องโดนบล็อก
    const res = await send('POST', '/api/auth/login', { body: alice });
    expect(res.status).toBe(429);
    // ต้องบอกว่าให้รอกี่วินาที
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('session lifecycle', () => {
  it('logout revokes the session immediately on the server', async () => {
    // สมัครและได้ cookie
    const cookie = sidCookie(await send('POST', '/api/auth/register', { body: alice }));
    // logout
    const out = await send('POST', '/api/auth/logout', { cookie });
    expect(out.status).toBe(204);
    // ใช้ cookie เดิมอีกครั้ง ต้องใช้ไม่ได้แล้ว (JWT ทำแบบนี้ไม่ได้)
    const me = await send('GET', '/api/auth/me', { cookie });
    expect(me.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    // สมัครและได้ cookie
    const cookie = sidCookie(await send('POST', '/api/auth/register', { body: alice }));
    // แก้เวลาหมดอายุในฐานข้อมูลให้เป็นอดีต
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    // ต้องได้ 401
    const me = await send('GET', '/api/auth/me', { cookie });
    expect(me.status).toBe(401);
  });

  it('rejects /me without a cookie or with a made-up cookie', async () => {
    // ไม่มี cookie
    expect((await send('GET', '/api/auth/me')).status).toBe(401);
    // cookie ที่แต่งขึ้นเอง
    expect((await send('GET', '/api/auth/me', { cookie: 'sid=made-up-token' })).status).toBe(401);
  });

  it('issues a new session on login, so an old token cannot be reused (session fixation)', async () => {
    // สมัครและได้ cookie แรก
    const first = sidCookie(await send('POST', '/api/auth/register', { body: alice }));
    // login อีกครั้งโดยแนบ cookie แรกไปด้วย
    const second = sidCookie(await send('POST', '/api/auth/login', { body: alice, cookie: first }));
    // cookie ใหม่ต้องไม่ซ้ำกับของเดิม
    expect(second).not.toBe(first);
    // cookie แรกต้องใช้ไม่ได้แล้ว
    expect((await send('GET', '/api/auth/me', { cookie: first })).status).toBe(401);
    // cookie ใหม่ต้องใช้ได้
    expect((await send('GET', '/api/auth/me', { cookie: second })).status).toBe(200);
  });
});

describe('onboarding guide', () => {
  it('starts as not seen, and is remembered after POST /onboarding (repeat calls keep the first time)', async () => {
    // สมัครใหม่ ยังไม่เคยดูคู่มือ
    const reg = await send('POST', '/api/auth/register', { body: alice });
    expect((await json(reg)).user.onboardedAt).toBeNull();
    // cookie
    const cookie = sidCookie(reg);
    // บันทึกว่าดูแล้ว
    const first = (await json(await send('POST', '/api/auth/onboarding', { cookie }))).user.onboardedAt;
    expect(first).toBeTruthy();
    // /me ต้องเห็นค่าเดียวกัน
    expect((await json(await send('GET', '/api/auth/me', { cookie }))).user.onboardedAt).toBe(first);
    // เรียกซ้ำ ค่าไม่เปลี่ยน
    expect((await json(await send('POST', '/api/auth/onboarding', { cookie }))).user.onboardedAt).toBe(first);
  });

  it('requires login', async () => {
    // ไม่มี cookie ได้ 401
    expect((await send('POST', '/api/auth/onboarding')).status).toBe(401);
  });
});

describe('CSRF origin check', () => {
  it('blocks a POST coming from another website with 403', async () => {
    // จำลอง request จากเว็บอื่น
    const res = await send('POST', '/api/auth/register', { body: alice, origin: 'https://evil.example' });
    // ต้องได้ 403
    expect(res.status).toBe(403);
  });

  it('allows a POST from our own frontend origin', async () => {
    // จำลอง request จากหน้าเว็บของเราเอง
    const res = await send('POST', '/api/auth/register', { body: alice, origin: 'http://localhost:5173' });
    // ต้องสมัครได้ตามปกติ
    expect(res.status).toBe(201);
  });
});
