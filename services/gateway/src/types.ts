// นำเข้าชนิดข้อมูลผู้ใช้ที่ได้จาก session
import type { SessionUser } from './auth/session';

// ตัวแปรที่ middleware ฝากไว้ใน context ของแต่ละ request
export type AppEnv = {
  Variables: {
    // ผู้ใช้ที่ login อยู่ มีค่าหลังผ่าน requireAuth แล้วเท่านั้น
    user: SessionUser;
  };
};

// รูปแบบ error ที่ gateway ตอบกลับทุกครั้ง เพื่อให้ frontend จัดการได้แบบเดียว
export type ApiError = { error: { code: string; message: string; details?: unknown } };

// ตัวช่วยสร้าง body ของ error ตามรูปแบบข้างบน
export function apiError(code: string, message: string, details?: unknown): ApiError {
  // ใส่ details เฉพาะเมื่อมีค่า
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}
