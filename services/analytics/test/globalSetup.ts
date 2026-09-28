// นำเข้า driver postgres.js
import postgres from 'postgres';
// นำเข้า Drizzle ที่ทำงานบน postgres.js
import { drizzle } from 'drizzle-orm/postgres-js';
// นำเข้าตัวรัน migration
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// vitest เรียกฟังก์ชันนี้ครั้งเดียวก่อนรัน test ทั้งหมด
export default async function setup() {
  // ใช้ฐานข้อมูล test ตัวเดียวกับที่ตั้งไว้ใน vitest.config.ts
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://analytics_user:analytics_pass@localhost:5434/analytics_test';
  // เปิด connection เดียวสำหรับรัน migration
  const conn = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // สร้างตารางในฐานข้อมูล test ให้ตรงกับ migration ล่าสุด
    await migrate(drizzle(conn), { migrationsFolder: './drizzle' });
  } finally {
    // ปิด connection เสมอ
    await conn.end();
  }
}
