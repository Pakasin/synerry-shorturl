// นำเข้าฟังก์ชันของ vitest สำหรับเขียน test และจำลองฟังก์ชัน
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// นำเข้าฟังก์ชันสร้าง app
import { createApp } from './app';

// ตัวแปรเก็บ app
let app: ReturnType<typeof createApp>;
// รายการ request ที่ redirect ส่งไปหา analytics (เก็บไว้ตรวจภายหลัง)
let clickCalls: { url: string; init: RequestInit }[];

// ลิงก์ตัวอย่างที่ gateway จำลองจะตอบกลับ
const LINK = { id: 7, originalUrl: 'https://www.synerry.com', isActive: true, startsAt: null as string | null, expiresAt: null as string | null, blocked: false };

// สร้าง response แบบ JSON
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// promise ที่ไม่มีวันเสร็จเอง จนกว่าจะถูกยกเลิกด้วย signal (จำลอง service ที่ช้าหรือหลับอยู่)
const hangUntilAborted = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));

// ตั้งค่า fetch จำลอง: กำหนดได้ว่า gateway และ analytics จะตอบอย่างไร
function mockUpstream(opts: {
  // พฤติกรรมของ gateway ตอนค้นลิงก์
  lookup?: (init?: RequestInit) => Promise<Response>;
  // พฤติกรรมของ analytics ตอนบันทึกคลิก
  click?: (init?: RequestInit) => Promise<Response>;
}) {
  // ค่าเริ่มต้น: gateway เจอลิงก์ และ analytics บันทึกได้
  const lookup = opts.lookup ?? (async () => reply(LINK));
  const click = opts.click ?? (async () => reply({ id: 1 }, 201));
  // แทนที่ fetch ของระบบ
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      // request ไปหา gateway
      if (String(url).startsWith('http://gateway.test/')) return lookup(init);
      // request ไปหา analytics: จดไว้ก่อนแล้วค่อยตอบ
      clickCalls.push({ url: String(url), init: init ?? {} });
      return click(init);
    }),
  );
}

// เปิดลิงก์สั้นแบบ browser
const open = (path: string, headers: Record<string, string> = {}, method = 'GET') => app.request(path, { method, headers });

// ก่อนแต่ละ test สร้าง app ใหม่ ล้างรายการ และตั้ง fetch จำลองแบบปกติ
beforeEach(() => {
  app = createApp();
  clickCalls = [];
  mockUpstream({});
});

// หลังแต่ละ test คืน fetch ตัวจริง
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('happy path', () => {
  it('redirects 302 to the original URL with no-store, and records the click', async () => {
    // เปิดลิงก์สั้นพร้อมข้อมูลแบบ browser จริง
    const res = await open('/synerry', {
      'user-agent': 'Mozilla/5.0 (iPhone)',
      referer: 'https://www.facebook.com/',
      'x-forwarded-for': '203.0.113.9, 10.0.0.1',
    });
    // ต้องได้ 302 ไปที่ URL ต้นฉบับ
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://www.synerry.com');
    // ต้องห้าม cache
    expect(res.headers.get('cache-control')).toBe('no-store');
    // ต้องส่งคลิกไป analytics หนึ่งครั้ง พร้อม key ภายใน
    expect(clickCalls).toHaveLength(1);
    expect((clickCalls[0].init.headers as Record<string, string>)['x-internal-key']).toBe('test-internal-key');
    // ข้อมูลคลิกต้องครบ และ IP ต้องเป็นค่าแรกของ x-forwarded-for
    const event = JSON.parse(String(clickCalls[0].init.body));
    expect(event).toMatchObject({ linkId: 7, ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone)', referer: 'https://www.facebook.com/' });
  });

  it('finishes saving the click BEFORE sending the redirect', async () => {
    // ตัวแปรบอกว่า analytics บันทึกเสร็จแล้วหรือยัง
    let saved = false;
    // analytics ใช้เวลา 80ms ก่อนบันทึกเสร็จ (น้อยกว่าเวลารอสูงสุด 200ms)
    mockUpstream({
      click: async () => {
        await new Promise((r) => setTimeout(r, 80));
        saved = true;
        return reply({ id: 1 }, 201);
      },
    });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ได้ 302 แล้ว
    expect(res.status).toBe(302);
    // ตอนที่ได้ response การบันทึกต้องเสร็จไปแล้ว (ไม่ใช่ยิงแล้วลืม)
    expect(saved).toBe(true);
  });

  it('sends visitors of the bare domain to the main app', async () => {
    // เปิดโดเมนลิงก์สั้นโดยไม่มีรหัส
    const res = await open('/');
    // ต้องพาไปหน้าเว็บหลัก
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://app.test');
  });
});

describe('analytics problems must never break the redirect', () => {
  it('still redirects when analytics is down', async () => {
    // analytics เชื่อมต่อไม่ได้
    mockUpstream({ click: async () => Promise.reject(new TypeError('fetch failed')) });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ต้องยังพาไปปลายทางได้
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://www.synerry.com');
  });

  it('still redirects when analytics returns 500', async () => {
    // analytics ตอบ error
    mockUpstream({ click: async () => reply({}, 500) });
    // ต้องยังพาไปปลายทางได้
    expect((await open('/synerry')).status).toBe(302);
  });

  it('gives up waiting after the click timeout when analytics hangs (e.g. asleep on Render)', async () => {
    // analytics ไม่ตอบเลย
    mockUpstream({ click: hangUntilAborted });
    // จับเวลา
    const start = Date.now();
    // เปิดลิงก์
    const res = await open('/synerry');
    // เวลาที่ใช้
    const elapsed = Date.now() - start;
    // ต้องยังพาไปปลายทางได้
    expect(res.status).toBe(302);
    // ต้องรอประมาณเวลาที่ตั้งไว้ (200ms) ไม่ใช่ค้างไปเรื่อยๆ
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('links that cannot be opened', () => {
  it('shows a 404 page for an unknown code', async () => {
    // gateway ตอบว่าไม่มีลิงก์นี้
    mockUpstream({ lookup: async () => reply({ error: {} }, 404) });
    // เปิดลิงก์
    const res = await open('/nope99');
    // ต้องได้ 404 เป็นหน้า HTML
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Link not found');
    // ต้องไม่บันทึกคลิก
    expect(clickCalls).toHaveLength(0);
  });

  it('shows 410 for a disabled link and does not record a click', async () => {
    // gateway ตอบลิงก์ที่ปิดใช้งาน
    mockUpstream({ lookup: async () => reply({ ...LINK, isActive: false }) });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ต้องได้ 410 และข้อความว่าถูกปิด
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('Link disabled');
    // ต้องไม่บันทึกคลิก
    expect(clickCalls).toHaveLength(0);
  });

  it('shows 410 for an expired link', async () => {
    // gateway ตอบลิงก์ที่หมดอายุเมื่อ 1 นาทีก่อน
    mockUpstream({ lookup: async () => reply({ ...LINK, expiresAt: new Date(Date.now() - 60_000).toISOString() }) });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ต้องได้ 410 และข้อความว่าหมดอายุ
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('Link expired');
  });

  it('shows 403 for a link whose start date is in the future, and does not record a click', async () => {
    // gateway ตอบลิงก์ที่เริ่มใช้พรุ่งนี้
    mockUpstream({ lookup: async () => reply({ ...LINK, startsAt: new Date(Date.now() + 86_400_000).toISOString() }) });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ต้องได้ 403 และข้อความว่ายังไม่เปิด
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('Link not active yet');
    // ต้องไม่บันทึกคลิก
    expect(clickCalls).toHaveLength(0);
  });

  it('redirects normally once the start date has passed', async () => {
    // gateway ตอบลิงก์ที่เริ่มใช้เมื่อ 1 นาทีก่อน
    mockUpstream({ lookup: async () => reply({ ...LINK, startsAt: new Date(Date.now() - 60_000).toISOString() }) });
    // ต้องพาไปปลายทาง
    expect((await open('/synerry')).status).toBe(302);
  });

  it('never redirects to a blocked destination', async () => {
    // gateway บอกว่าปลายทางถูกบล็อก
    mockUpstream({ lookup: async () => reply({ ...LINK, blocked: true }) });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ต้องได้ 410 และไม่มี location
    expect(res.status).toBe(410);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('Link blocked');
  });

  it('shows 503 (not 404) when the gateway is down, because the link may exist', async () => {
    // gateway ไม่ตอบ
    mockUpstream({ lookup: hangUntilAborted });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ต้องได้ 503 ให้ลองใหม่ ไม่ใช่บอกว่าไม่มีลิงก์
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('Please try again');
  });

  it('never redirects to a non-http URL, even if the database contains one', async () => {
    // gateway ตอบลิงก์อันตราย (จำลองกรณีข้อมูลถูกแก้จากช่องทางอื่น)
    mockUpstream({ lookup: async () => reply({ ...LINK, originalUrl: 'javascript:alert(1)' }) });
    // เปิดลิงก์
    const res = await open('/synerry');
    // ต้องไม่พาไป
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it('rejects codes with invalid characters without calling the gateway', async () => {
    // ตัวจำลองที่นับจำนวนครั้งที่ถูกเรียก
    const lookup = vi.fn(async () => reply(LINK));
    mockUpstream({ lookup });
    // เปิด path ที่มีจุด
    const res = await open('/favicon.ico');
    // ต้องได้ 404 และต้องไม่เรียก gateway เลย
    expect(res.status).toBe(404);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('HEAD requests', () => {
  it('answer with the redirect but are not counted as clicks', async () => {
    // โปรแกรมเช็กลิงก์มักส่ง HEAD
    const res = await open('/synerry', {}, 'HEAD');
    // ต้องได้ 302 เหมือนเดิม
    expect(res.status).toBe(302);
    // แต่ต้องไม่บันทึกคลิก
    expect(clickCalls).toHaveLength(0);
  });
});
