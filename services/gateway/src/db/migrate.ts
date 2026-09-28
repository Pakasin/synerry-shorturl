// นำเข้า driver postgres.js
import postgres from 'postgres';
// นำเข้า Drizzle ที่ทำงานบน postgres.js
import { drizzle } from 'drizzle-orm/postgres-js';
// นำเข้าตัวรัน migration ของ Drizzle
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// อ่าน connection string จาก environment
const url = process.env.DATABASE_URL;
// ถ้าไม่ได้ตั้งค่าไว้ ให้หยุดพร้อมบอกสาเหตุ
if (!url) throw new Error('DATABASE_URL is not set');

// เปิด connection เดียวพอสำหรับการรัน migration ตามลำดับ
const conn = postgres(url, { max: 1 });

try {
  // รันไฟล์ SQL ในโฟลเดอร์ drizzle ที่ยังไม่เคยรัน ตามลำดับหมายเลข
  await migrate(drizzle(conn), { migrationsFolder: './drizzle' });
  // แจ้งว่ารันสำเร็จ
  console.log('[gateway] migrations applied');
} finally {
  // ปิด connection เสมอ ไม่ว่าจะสำเร็จหรือล้มเหลว
  await conn.end();
}
