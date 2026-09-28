// นำเข้า driver postgres.js สำหรับเชื่อมต่อ PostgreSQL
import postgres from 'postgres';
// นำเข้า Drizzle ที่ทำงานบน driver postgres.js
import { drizzle } from 'drizzle-orm/postgres-js';
// นำเข้านิยามตารางทั้งหมดของ service นี้
import * as schema from './schema';

// อ่าน connection string ของ gateway_db จาก environment
const url = process.env.DATABASE_URL;
// ถ้าไม่ได้ตั้งค่าไว้ ให้หยุดทำงานทันทีพร้อมบอกสาเหตุ แทนที่จะไปพังตอนมี request
if (!url) throw new Error('DATABASE_URL is not set for gateway service');

// สร้าง connection pool ไว้ใช้ร่วมกันทั้ง service
export const sql = postgres(url, {
  // จำกัดจำนวน connection เพราะ Neon free tier รับ connection ได้จำกัด
  max: 5,
  // ถ้าเชื่อมต่อไม่ได้ภายใน 5 วินาทีให้ถือว่าล้มเหลว
  connect_timeout: 5,
  // ปิด connection ที่ว่างเกิน 20 วินาที เพื่อคืนทรัพยากร
  idle_timeout: 20,
});

// สร้างตัว query แบบมีชนิดข้อมูลของ Drizzle โดยใช้ connection pool เดียวกัน
export const db = drizzle(sql, { schema });

// ตรวจว่าฐานข้อมูลตอบสนองหรือไม่ ใช้ใน /health
export async function pingDb(): Promise<boolean> {
  try {
    // รันคำสั่งที่เบาที่สุดเพื่อทดสอบการเชื่อมต่อ
    await sql`select 1`;
    // ถ้าไม่ error แปลว่าฐานข้อมูลใช้งานได้
    return true;
  } catch {
    // ถ้า error แปลว่าเชื่อมต่อฐานข้อมูลไม่ได้
    return false;
  }
}
