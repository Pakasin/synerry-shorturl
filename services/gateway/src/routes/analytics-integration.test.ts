// นำเข้าฟังก์ชันของ vitest สำหรับเขียน test และจำลองฟังก์ชัน
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from '../app';
// นำเข้า connection ฐานข้อมูล (ต่อกับฐานข้อมูล test)
import { sql } from '../db/client';
// นำเข้าตัวช่วยที่ใช้ร่วมกันระหว่างไฟล์ test
import * as h from '../../test/helpers';
// นำเข้าตัวช่วยอ่าน JSON และสมัครผู้ใช้
import { json, registerAndLogin } from '../../test/helpers';

// ตัวแปรเก็บ app และ cookie ของผู้ใช้
let app: ReturnType<typeof createApp>;
let alice: string;
let bob: string;
// ตัวจำลอง fetch ที่ gateway ใช้เรียก analytics
let fetchMock: ReturnType<typeof vi.fn>;

// ส่ง request ไปที่ app ของ test ปัจจุบัน
const send = (method: string, path: string, opts?: Parameters<typeof h.send>[3]) => h.send(app, method, path, opts);
// สร้างลิงก์และคืนข้อมูลลิงก์
const create = async (cookie: string, url: string) => (await json(await send('POST', '/api/links', { cookie, body: { url } }))).link;
// สร้าง response แบบ JSON สำหรับตัวจำลอง
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ก่อนแต่ละ test ล้างข้อมูล สร้าง app และผู้ใช้ และแทนที่ fetch ด้วยตัวจำลอง
beforeEach(async () => {
  // ลบข้อมูลทุกตาราง
  await sql`truncate users, links, sessions restart identity cascade`;
  // สร้าง app ใหม่
  app = createApp();
  // สมัครผู้ใช้สองคน
  alice = await registerAndLogin(app, 'alice');
  bob = await registerAndLogin(app, 'bob');
  // ตัวจำลองเริ่มต้น: analytics ล่ม (เชื่อมต่อไม่ได้)
  fetchMock = vi.fn(async () => {
    throw new TypeError('fetch failed');
  });
  // แทนที่ fetch ของระบบด้วยตัวจำลอง (app.request ไม่ได้ใช้ fetch จึงไม่กระทบ)
  vi.stubGlobal('fetch', fetchMock);
});

// หลังแต่ละ test คืน fetch ตัวจริง
afterEach(() => {
  vi.unstubAllGlobals();
});

// หลัง test ทั้งหมดเสร็จ ปิด connection pool
afterAll(async () => {
  await sql.end();
});

describe('history with click counts', () => {
  it('asks analytics for my link ids only, with the internal key, and shows the counts', async () => {
    // alice สร้าง 2 ลิงก์ bob สร้าง 1 ลิงก์
    const a1 = await create(alice, 'https://a.example.com');
    const a2 = await create(alice, 'https://b.example.com');
    await create(bob, 'https://bob.example.com');
    // ให้ analytics ตอบยอดคลิก
    fetchMock.mockImplementation(async () => reply({ counts: { [a1.id]: 5, [a2.id]: 0 }, totalClicks: 5 }));

    // alice ขอดูประวัติ
    const list = await json(await send('GET', '/api/links', { cookie: alice }));
    // ต้องได้ยอดคลิกของแต่ละลิงก์
    expect(list.analyticsAvailable).toBe(true);
    expect(list.items.map((l: { clicks: number }) => l.clicks).sort()).toEqual([0, 5]);

    // ตรวจ request ที่ gateway ส่งไปหา analytics
    const [url, init] = fetchMock.mock.calls[0];
    // ต้องเรียก endpoint สรุปยอด
    expect(String(url)).toBe('http://127.0.0.1:9/internal/stats/summary');
    // ต้องแนบ key ภายใน
    expect(init.headers['x-internal-key']).toBe('test-internal-key');
    // ต้องส่งเฉพาะ id ของ alice ไม่มีของ bob
    expect(JSON.parse(init.body).linkIds.sort()).toEqual([a1.id, a2.id].sort());
  });

  it('still returns the history when analytics is down, with clicks = null', async () => {
    // สร้างลิงก์ (fetch จำลองยังเป็นแบบล่มอยู่)
    await create(alice, 'https://a.example.com');
    // ขอดูประวัติ
    const res = await send('GET', '/api/links', { cookie: alice });
    // หน้าประวัติต้องยังใช้ได้
    expect(res.status).toBe(200);
    const list = await json(res);
    // บอกว่าไม่มีข้อมูลคลิก และยอดคลิกเป็น null ไม่ใช่ 0
    expect(list.analyticsAvailable).toBe(false);
    expect(list.items[0].clicks).toBeNull();
  });
});

describe('GET /api/links/:id/stats', () => {
  it('checks ownership before calling analytics', async () => {
    // alice สร้างลิงก์
    const link = await create(alice, 'https://a.example.com');
    // bob ขอดูสถิติลิงก์ของ alice
    const res = await send('GET', `/api/links/${link.id}/stats`, { cookie: bob });
    // ต้องได้ 404
    expect(res.status).toBe(404);
    // และต้องไม่มีการเรียก analytics เลย
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns stats from analytics, or 503 when analytics is down', async () => {
    // สร้างลิงก์
    const link = await create(alice, 'https://a.example.com');
    // ตอนนี้ analytics ล่ม ต้องได้ 503
    expect((await send('GET', `/api/links/${link.id}/stats`, { cookie: alice })).status).toBe(503);
    // ให้ analytics ตอบสถิติ
    fetchMock.mockImplementation(async () => reply({ totalClicks: 12, daily: [] }));
    // ขอสถิติ 7 วัน
    const res = await send('GET', `/api/links/${link.id}/stats?days=7`, { cookie: alice });
    // ต้องได้ข้อมูลลิงก์และสถิติ
    const body = await json(res);
    expect(body.stats.totalClicks).toBe(12);
    expect(body.link.id).toBe(link.id);
    // ต้องเรียก analytics ด้วยรหัสลิงก์และจำนวนวันที่ถูกต้อง
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe(`http://127.0.0.1:9/internal/stats/${link.id}?days=7`);
  });

  it('only allows 7, 30 or 90 days', async () => {
    // สร้างลิงก์
    const link = await create(alice, 'https://a.example.com');
    // ขอ 5 วัน ต้องได้ 400
    expect((await send('GET', `/api/links/${link.id}/stats?days=5`, { cookie: alice })).status).toBe(400);
  });
});

describe('permanently deleting a link', () => {
  it('asks analytics to delete its clicks', async () => {
    // สร้างลิงก์
    const link = await create(alice, 'https://a.example.com');
    // ให้ analytics ตอบว่าลบแล้ว
    fetchMock.mockImplementation(async () => reply({ deleted: 3 }));
    // ลบถาวร
    expect((await send('DELETE', `/api/links/${link.id}/permanent`, { cookie: alice })).status).toBe(204);
    // ต้องเรียก DELETE ไปที่ analytics ด้วยรหัสลิงก์นี้
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`http://127.0.0.1:9/internal/clicks/${link.id}`);
    expect(init.method).toBe('DELETE');
  });

  it('still deletes the link when analytics is down', async () => {
    // สร้างลิงก์ (analytics ล่ม)
    const link = await create(alice, 'https://a.example.com');
    // ลบถาวร ต้องสำเร็จ
    expect((await send('DELETE', `/api/links/${link.id}/permanent`, { cookie: alice })).status).toBe(204);
    // ลิงก์ต้องหายไปจริง
    expect((await send('GET', `/api/links/${link.id}`, { cookie: alice })).status).toBe(404);
  });
});

describe('GET /api/stats/summary', () => {
  it('returns totals and the top links by clicks', async () => {
    // สร้าง 3 ลิงก์ และปิดใช้งาน 1 ลิงก์
    const a = await create(alice, 'https://a.example.com');
    const b = await create(alice, 'https://b.example.com');
    const c = await create(alice, 'https://c.example.com');
    await send('PATCH', `/api/links/${c.id}`, { cookie: alice, body: { isActive: false } });
    // ให้ analytics ตอบยอดคลิก
    fetchMock.mockImplementation(async () => reply({ counts: { [a.id]: 2, [b.id]: 9, [c.id]: 0 }, totalClicks: 11 }));
    // ขอสรุป
    const s = await json(await send('GET', '/api/stats/summary', { cookie: alice }));
    // ลิงก์ทั้งหมด 3 ใช้งานได้ 2 คลิกรวม 11
    expect(s).toMatchObject({ totalLinks: 3, activeLinks: 2, totalClicks: 11, analyticsAvailable: true });
    // อันดับ: b (9) แล้ว a (2) ลิงก์ที่ไม่มีคลิกไม่ต้องแสดง
    expect(s.topLinks.map((l: { id: number }) => l.id)).toEqual([b.id, a.id]);
  });
});
