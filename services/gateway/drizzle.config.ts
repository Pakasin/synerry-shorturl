// นำเข้าฟังก์ชันสร้าง config ของ drizzle-kit
import { defineConfig } from 'drizzle-kit';

// ตั้งค่า drizzle-kit สำหรับสร้างไฟล์ migration ของ gateway service
export default defineConfig({
  // ใช้ฐานข้อมูล PostgreSQL
  dialect: 'postgresql',
  // ไฟล์ที่นิยามตารางของ service นี้
  schema: './src/db/schema.ts',
  // โฟลเดอร์ที่เก็บไฟล์ SQL migration ที่สร้างออกมา
  out: './drizzle',
});
