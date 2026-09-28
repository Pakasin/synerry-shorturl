// นำเข้าฟังก์ชันสร้าง config ของ vitest
import { defineConfig } from 'vitest/config';

// ตั้งค่า vitest ของ redirect (service นี้ไม่มีฐานข้อมูล จึงไม่ต้องมี globalSetup)
export default defineConfig({
  test: {
    env: {
      // URL ปลอมของ gateway ใน test ทุกการเรียกจะถูกดักด้วย fetch จำลอง
      GATEWAY_URL: 'http://gateway.test',
      // URL ปลอมของ analytics
      ANALYTICS_URL: 'http://analytics.test',
      // URL หน้าเว็บหลัก
      APP_URL: 'http://app.test',
      // key ภายในของ test
      INTERNAL_API_KEY: 'test-internal-key',
      // เวลารอบันทึกคลิกใน test สั้นลง เพื่อให้ test ที่จำลอง analytics ช้าจบเร็ว
      CLICK_TIMEOUT_MS: '200',
      // เวลารอค้นลิงก์ใน test
      LOOKUP_TIMEOUT_MS: '200',
    },
  },
});
