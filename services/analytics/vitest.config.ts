// นำเข้าฟังก์ชันสร้าง config ของ vitest
import { defineConfig } from 'vitest/config';

// ฐานข้อมูล test ของ analytics ใช้ค่าจาก environment ถ้ามี ไม่งั้นใช้ของ docker-compose
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://analytics_user:analytics_pass@localhost:5434/analytics_test';

// ตั้งค่า vitest ของ analytics
export default defineConfig({
  test: {
    env: {
      // ฐานข้อมูล test
      DATABASE_URL: TEST_DB,
      // บอกโค้ดว่ากำลังรัน test
      NODE_ENV: 'test',
      // key ภายในที่ใช้ใน test เท่านั้น
      INTERNAL_API_KEY: 'test-internal-key',
      // salt ของ test
      IP_HASH_SALT: 'test-salt',
      // ใช้เวลาไทยตัดวัน
      STATS_TIMEZONE: 'Asia/Bangkok',
    },
    // รัน migration กับฐานข้อมูล test ก่อนเริ่ม
    globalSetup: ['./test/globalSetup.ts'],
    // รันไฟล์ test ทีละไฟล์ เพราะใช้ฐานข้อมูลเดียวกัน
    fileParallelism: false,
  },
});
