// นำเข้าชนิดข้อมูลของ app
import type { createApp } from '../src/app';

// ชนิดข้อมูลของ app ที่ใช้ใน test
type App = ReturnType<typeof createApp>;

// ตัวเลือกของ request ใน test
type SendOptions = { body?: unknown; cookie?: string; origin?: string; headers?: Record<string, string> };

// ส่ง request แบบ JSON ไปที่ app โดยไม่ต้องเปิด port จริง
export function send(app: App, method: string, path: string, opts: SendOptions = {}) {
  // สร้าง header พื้นฐาน และรวม header เพิ่มเติมที่ส่งมา
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
  // แนบ cookie ถ้ามี
  if (opts.cookie) headers.cookie = opts.cookie;
  // แนบ origin ถ้ามี เพื่อจำลอง request จาก browser
  if (opts.origin) headers.origin = opts.origin;
  // ส่ง request เข้า app
  return app.request(path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

// ดึงค่า sid=... ออกจาก header set-cookie เพื่อนำไปใช้กับ request ถัดไป
export function sidCookie(res: Response): string {
  // อ่าน header set-cookie แล้วเอาเฉพาะส่วน name=value
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

// อ่าน body ของ response เป็น JSON แบบไม่ตรวจชนิด เพราะใน test ตรวจค่าด้วย expect อยู่แล้ว
export const json = (res: Response): Promise<any> => res.json();

// สมัครผู้ใช้ใหม่แล้วคืน cookie ของ session ใช้เตรียมข้อมูลใน test
export async function registerAndLogin(app: App, username: string): Promise<string> {
  // สมัครด้วยรหัสผ่านตายตัว
  const res = await send(app, 'POST', '/api/auth/register', { body: { username, password: 'Password123' } });
  // ถ้าสมัครไม่สำเร็จ ให้ test ล้มพร้อมบอกสาเหตุ
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  // คืน cookie
  return sidCookie(res);
}
