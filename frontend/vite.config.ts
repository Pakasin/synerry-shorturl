// นำเข้าฟังก์ชันสร้าง config ของ Vite
import { defineConfig } from 'vite';
// นำเข้า plugin สำหรับ React (JSX และ hot reload)
import react from '@vitejs/plugin-react';
// นำเข้า plugin ของ Tailwind CSS v4
import tailwindcss from '@tailwindcss/vite';

// ตั้งค่า Vite
export default defineConfig({
  // เปิดใช้ plugin
  plugins: [react(), tailwindcss()],
  server: {
    // ใช้ port 5173 เสมอ ถ้าไม่ว่างให้แจ้ง error แทนการย้าย port เอง (APP_ORIGINS ของ gateway ผูกกับ port นี้)
    port: 5173,
    strictPort: true,
    // ตอน dev ส่งต่อ /api ไปที่ gateway ทำให้ browser เห็นหน้าเว็บกับ API เป็นโดเมนเดียวกัน cookie จึงใช้ได้
    proxy: { '/api': 'http://localhost:3001' },
  },
});
