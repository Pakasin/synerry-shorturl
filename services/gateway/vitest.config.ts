// นำเข้าฟังก์ชันสร้าง config ของ vitest
import { defineConfig } from 'vitest/config';

// connection string ของฐานข้อมูล test ใช้ค่าจาก environment ถ้ามี (เช่นบน CI) ไม่งั้นใช้ของ docker-compose
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://gateway_user:gateway_pass@localhost:5434/gateway_test';

// ตั้งค่า vitest ของ gateway
export default defineConfig({
  test: {
    // ตั้ง environment ก่อนโหลดโค้ด เพื่อให้ db client ต่อเข้าฐานข้อมูล test แทนฐานข้อมูลจริง
    env: {
      // ฐานข้อมูล test
      DATABASE_URL: TEST_DB,
      // บอกโค้ดว่ากำลังรัน test
      NODE_ENV: 'test',
      // key ภายในที่ใช้ใน test เท่านั้น
      INTERNAL_API_KEY: 'test-internal-key',
      // โดเมนลิงก์สั้นที่ test คาดหวัง
      SHORT_BASE_URL: 'http://localhost:3002',
      // ชี้ analytics ไปที่ port 9 ซึ่งไม่มีใครฟังอยู่ ถ้า test ไหนลืมจำลอง fetch จะล้มเร็ว ไม่ไปโดน analytics ตัวจริง
      ANALYTICS_URL: 'http://127.0.0.1:9',
    },
    // รัน migration กับฐานข้อมูล test หนึ่งครั้งก่อนเริ่ม test ทั้งหมด
    globalSetup: ['./test/globalSetup.ts'],
    // รันไฟล์ test ทีละไฟล์ เพราะทุกไฟล์ใช้ฐานข้อมูลเดียวกันและล้างข้อมูลก่อนแต่ละ test
    fileParallelism: false,
  },
});
