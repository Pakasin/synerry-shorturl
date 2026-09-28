// ตัด / ท้าย URL ออก เพื่อให้ต่อ path ได้ถูกต้อง
const trimSlash = (url: string) => url.replace(/\/+$/, '');

// อ่านค่าตั้งค่าของ redirect จาก environment ไว้ที่เดียว
export const config = {
  // URL ภายในของ gateway ใช้ค้นลิงก์
  gatewayUrl: trimSlash(process.env.GATEWAY_URL ?? 'http://localhost:3001'),
  // URL ภายในของ analytics ใช้บันทึกคลิก
  analyticsUrl: trimSlash(process.env.ANALYTICS_URL ?? 'http://localhost:3003'),
  // URL หน้าเว็บหลัก ใช้พาผู้ใช้ไปเมื่อเปิดโดเมนลิงก์สั้นเปล่าๆ หรือกดปุ่มในหน้า error
  appUrl: trimSlash(process.env.APP_URL ?? 'http://localhost:5173'),
  // key ลับที่ใช้เรียก service อื่น
  internalApiKey: process.env.INTERNAL_API_KEY ?? '',
  // เวลารอค้นลิงก์สูงสุด (มิลลิวินาที) ถ้าเกินแสดงหน้า "ลองใหม่อีกครั้ง"
  lookupTimeoutMs: Number(process.env.LOOKUP_TIMEOUT_MS ?? 3000),
  // เวลารอบันทึกคลิกสูงสุด (มิลลิวินาที) ถ้าเกินให้พาไปปลายทางเลย ไม่ให้ผู้ใช้รอนาน
  clickTimeoutMs: Number(process.env.CLICK_TIMEOUT_MS ?? 1500),
};
