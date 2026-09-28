// นำเข้าฟังก์ชันของ vitest สำหรับเขียน test
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from '../app';
// นำเข้า connection ฐานข้อมูล (ต่อกับฐานข้อมูล test)
import { db, sql } from '../db/client';
// นำเข้านิยามตาราง
import { clicks } from '../db/schema';

// user agent ตัวอย่างของ iPhone Safari
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// user agent ตัวอย่างของ Chrome บน Windows
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
// user agent ของตัวทำ preview ลิงก์ของ Slack
const SLACK_BOT = 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)';

// ตัวแปรเก็บ app
let app: ReturnType<typeof createApp>;
// header ที่มี key ภายในถูกต้อง
const KEY = { 'x-internal-key': 'test-internal-key', 'content-type': 'application/json' };

// ส่ง request พร้อม key ภายใน
function call(method: string, path: string, body?: unknown) {
  return app.request(path, { method, headers: KEY, body: body === undefined ? undefined : JSON.stringify(body) });
}
// อ่าน body เป็น JSON แบบไม่ตรวจชนิด
const json = (res: Response): Promise<any> => res.json();
// บันทึกคลิกหนึ่งครั้ง
const click = (body: Record<string, unknown>) => call('POST', '/internal/clicks', body);

// วันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD
const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

// ก่อนแต่ละ test ล้างข้อมูลและสร้าง app ใหม่
beforeEach(async () => {
  // ลบข้อมูลทั้งหมดและรีเซ็ตเลข id
  await sql`truncate clicks restart identity`;
  // สร้าง app ใหม่
  app = createApp();
});

// หลัง test ทั้งหมดเสร็จ ปิด connection pool
afterAll(async () => {
  await sql.end();
});

describe('internal key', () => {
  it('rejects every internal route without the right key', async () => {
    // ไม่มี key
    const noKey = await app.request('/internal/stats/1');
    // key ผิด
    const wrong = await app.request('/internal/stats/1', { headers: { 'x-internal-key': 'nope' } });
    // ต้องได้ 401 ทั้งคู่
    expect(noKey.status).toBe(401);
    expect(wrong.status).toBe(401);
  });
});

describe('POST /internal/clicks', () => {
  it('stores device, browser and OS, and a salted hash instead of the IP', async () => {
    // บันทึกคลิกจาก iPhone
    const res = await click({ linkId: 1, ip: '203.0.113.7', userAgent: IPHONE });
    // ต้องได้ 201
    expect(res.status).toBe(201);
    // อ่านแถวที่บันทึก
    const [row] = await db.select().from(clicks);
    // แยกข้อมูลอุปกรณ์ได้ถูกต้อง
    expect(row.deviceType).toBe('mobile');
    expect(row.browser).toMatch(/Safari/);
    expect(row.os).toBe('iOS');
    // ต้องไม่มี IP จริงอยู่ในแถว
    expect(JSON.stringify(row)).not.toContain('203.0.113.7');
    // hash ต้องยาว 64 ตัว (sha256)
    expect(row.ipHash).toHaveLength(64);
  });

  it('rejects an invalid event with 400', async () => {
    // linkId ไม่ใช่ตัวเลข
    expect((await click({ linkId: 'abc' })).status).toBe(400);
  });
});

describe('GET /internal/stats/:linkId', () => {
  it('counts clicks and unique visitors, excludes bots but reports them separately', async () => {
    // คนที่ 1 คลิก 2 ครั้ง จาก Google
    await click({ linkId: 1, ip: '1.1.1.1', userAgent: IPHONE, referer: 'https://www.google.com/search?q=synerry' });
    await click({ linkId: 1, ip: '1.1.1.1', userAgent: IPHONE, referer: 'https://www.google.com/' });
    // คนที่ 2 เปิดตรงหรือสแกน QR (ไม่มี referer)
    await click({ linkId: 1, ip: '2.2.2.2', userAgent: WINDOWS_CHROME });
    // Slack มาทำ preview
    await click({ linkId: 1, ip: '3.3.3.3', userAgent: SLACK_BOT });
    // คลิกของลิงก์อื่น ต้องไม่ถูกนับ
    await click({ linkId: 2, ip: '4.4.4.4', userAgent: IPHONE });

    // ขอสถิติ
    const stats = await json(await call('GET', '/internal/stats/1?days=7'));
    // คลิกรวม 3 (ไม่นับ bot และไม่นับลิงก์อื่น)
    expect(stats.totalClicks).toBe(3);
    // ผู้เข้าชมไม่ซ้ำ 2 คน
    expect(stats.uniqueVisitors).toBe(2);
    // bot 1 ครั้ง แสดงแยก
    expect(stats.botClicks).toBe(1);
    // แหล่งที่มา: google 2 ครั้ง, เข้าตรง 1 ครั้ง
    expect(stats.referers).toEqual([{ name: 'www.google.com', count: 2 }, { name: 'Direct', count: 1 }]);
    // อุปกรณ์: mobile 2, desktop 1
    expect(stats.devices).toEqual([{ name: 'mobile', count: 2 }, { name: 'desktop', count: 1 }]);
    // คลิกล่าสุด 3 รายการ และต้องไม่มี ip_hash ติดออกไป
    expect(stats.recent).toHaveLength(3);
    expect(JSON.stringify(stats.recent)).not.toContain('ipHash');
  });

  it('returns one entry per day with zeros filled in, split by Thai time', async () => {
    // วันนี้ตามเวลาไทย
    const today = bangkokToday();
    // คลิกตอน 00:30 เวลาไทยของวันนี้ ซึ่งยังเป็นเมื่อวานตามเวลา UTC
    await click({ linkId: 1, clickedAt: `${today}T00:30:00+07:00`, userAgent: IPHONE });
    // ขอสถิติ 7 วัน
    const stats = await json(await call('GET', '/internal/stats/1?days=7'));
    // ต้องมีครบ 7 วัน แม้วันอื่นจะไม่มีคลิก
    expect(stats.daily).toHaveLength(7);
    // วันสุดท้ายคือวันนี้ และต้องนับคลิกนั้นเป็นของวันนี้ (ไม่ใช่เมื่อวานแบบ UTC)
    expect(stats.daily.at(-1)).toEqual({ date: today, clicks: 1 });
    // วันก่อนหน้าต้องเป็น 0
    expect(stats.daily.at(-2).clicks).toBe(0);
  });

  it('returns zeros for a link with no clicks', async () => {
    // ขอสถิติของลิงก์ที่ไม่มีคลิก
    const stats = await json(await call('GET', '/internal/stats/99'));
    // ต้องได้ 0 และมีข้อมูลรายวันครบ 30 วัน (ค่าเริ่มต้น)
    expect(stats.totalClicks).toBe(0);
    expect(stats.daily).toHaveLength(30);
  });
});

describe('POST /internal/stats/summary', () => {
  it('returns a count for every requested link, 0 when none', async () => {
    // ลิงก์ 1 มี 2 คลิก ลิงก์ 2 มี 1 คลิก
    await click({ linkId: 1, userAgent: IPHONE });
    await click({ linkId: 1, userAgent: IPHONE });
    await click({ linkId: 2, userAgent: IPHONE });
    // ขอยอดของลิงก์ 1 2 และ 3
    const res = await json(await call('POST', '/internal/stats/summary', { linkIds: [1, 2, 3] }));
    // ลิงก์ 3 ไม่มีคลิกต้องได้ 0 ไม่ใช่หายไป
    expect(res.counts).toEqual({ '1': 2, '2': 1, '3': 0 });
    // ยอดรวม 3
    expect(res.totalClicks).toBe(3);
  });

  it('rejects a bad body with 400', async () => {
    // linkIds ไม่ใช่ array
    expect((await call('POST', '/internal/stats/summary', { linkIds: 'x' })).status).toBe(400);
  });
});

describe('DELETE /internal/clicks/:linkId', () => {
  it('deletes only the clicks of that link', async () => {
    // คลิกของลิงก์ 1 สองครั้ง และลิงก์ 2 หนึ่งครั้ง
    await click({ linkId: 1 });
    await click({ linkId: 1 });
    await click({ linkId: 2 });
    // ลบคลิกของลิงก์ 1
    const res = await json(await call('DELETE', '/internal/clicks/1'));
    // ต้องลบได้ 2 แถว
    expect(res.deleted).toBe(2);
    // ต้องเหลือแถวเดียวของลิงก์ 2
    const left = await db.select().from(clicks);
    expect(left.map((r) => r.linkId)).toEqual([2]);
  });
});

describe('country from IP', () => {
  it('stores the country for a public IP, and none for private or local IPs', async () => {
    // IP สาธารณะในไทย
    await click({ linkId: 1, ip: '1.46.0.1', userAgent: IPHONE });
    // IP สาธารณะของ Google DNS ในสหรัฐ
    await click({ linkId: 1, ip: '8.8.8.8', userAgent: IPHONE });
    // IP ภายในและเครื่องตัวเอง (ฐานข้อมูลอาจตอบประเทศผิดๆ จึงต้องไม่หาเลย)
    await click({ linkId: 1, ip: '127.0.0.1', userAgent: IPHONE });
    await click({ linkId: 1, ip: '192.168.1.10', userAgent: IPHONE });
    // IPv4 ที่ห่อมาในรูป IPv6
    await click({ linkId: 1, ip: '::ffff:1.46.0.1', userAgent: IPHONE });
    // อ่านประเทศที่บันทึกไว้ เรียงตาม id
    const rows = await db.select().from(clicks).orderBy(clicks.id);
    expect(rows.map((r) => r.country)).toEqual(['TH', 'US', null, null, 'TH']);
  });

  it('returns a country breakdown in the stats, with unknowns grouped', async () => {
    // คลิกจากไทย 2 ครั้ง สหรัฐ 1 ครั้ง และไม่ทราบ 1 ครั้ง
    await click({ linkId: 1, ip: '1.46.0.1', userAgent: IPHONE });
    await click({ linkId: 1, ip: '1.46.0.2', userAgent: IPHONE });
    await click({ linkId: 1, ip: '8.8.8.8', userAgent: IPHONE });
    await click({ linkId: 1, ip: '10.0.0.1', userAgent: IPHONE });
    // ขอสถิติ
    const stats = await json(await call('GET', '/internal/stats/1?days=7'));
    // ต้องได้ประเทศเรียงจากมากไปน้อย
    expect(stats.countries).toEqual([
      { name: 'TH', count: 2 },
      { name: 'US', count: 1 },
      { name: 'Unknown', count: 1 },
    ]);
  });
});
