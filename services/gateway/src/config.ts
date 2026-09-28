// อ่านค่าตั้งค่าของ gateway จาก environment ไว้ที่เดียว ส่วนอื่นของโค้ดจะไม่อ่าน process.env ตรงๆ
export const config = {
  // true เมื่อรันบน production ใช้ตัดสินใจเรื่อง cookie แบบ Secure
  isProduction: process.env.NODE_ENV === 'production',
  // ชื่อ cookie ที่เก็บ session token
  sessionCookieName: 'sid',
  // อายุ session เป็นวัน ถ้าไม่ตั้งค่าใช้ 7 วัน
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  // รายชื่อ origin ที่อนุญาตให้ส่ง request แบบแก้ไขข้อมูลได้ คั่นด้วยเครื่องหมายจุลภาค
  // RENDER_EXTERNAL_URL คือ URL สาธารณะของ service นี้ที่ Render ตั้งให้อัตโนมัติ (หน้าเว็บอยู่โดเมนเดียวกับ API จึงต้องอนุญาตเสมอ)
  allowedOrigins: [process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:3001', process.env.RENDER_EXTERNAL_URL ?? '']
    // รวมแล้วแยกเป็นรายการ
    .join(',')
    .split(',')
    // ตัดช่องว่างหัวท้าย
    .map((o) => o.trim())
    // ตัดรายการว่างทิ้ง
    .filter(Boolean),
  // URL สาธารณะของ redirect service ใช้ประกอบเป็นลิงก์สั้น ตัด / ท้ายออก
  shortBaseUrl: (process.env.SHORT_BASE_URL ?? 'http://localhost:3002').replace(/\/+$/, ''),
  // key ลับที่ใช้ยืนยันตัวตนเมื่อ service อื่นเรียก route ภายใน
  internalApiKey: process.env.INTERNAL_API_KEY,
  // URL ภายในของ analytics service ที่ gateway ใช้ขอสถิติ ตัด / ท้ายออก
  analyticsUrl: (process.env.ANALYTICS_URL ?? 'http://localhost:3003').replace(/\/+$/, ''),
  // เวลารอ analytics สูงสุด (มิลลิวินาที) ถ้าเกินให้แสดงหน้าเว็บต่อไปโดยไม่มีตัวเลขคลิก
  analyticsTimeoutMs: Number(process.env.ANALYTICS_TIMEOUT_MS ?? 3000),
};
