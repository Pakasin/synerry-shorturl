// นำเข้า bcryptjs สำหรับ hash รหัสผ่านของผู้ใช้ตัวอย่าง
import bcrypt from 'bcryptjs';
// นำเข้าตัวสร้างเงื่อนไข where ของ Drizzle
import { eq } from 'drizzle-orm';
// นำเข้า connection ฐานข้อมูลของ gateway
import { db, sql } from './client';
// นำเข้านิยามตาราง
import { links, users } from './schema';

// บัญชีตัวอย่างสำหรับผู้ตรวจงาน ใช้ login ทดสอบระบบได้ทันที
const DEMO_USERNAME = 'demo';
// รหัสผ่านของบัญชีตัวอย่าง จะแสดงไว้ใน README
const DEMO_PASSWORD = 'Demo@1234';
// บัญชีผู้ดูแลตัวอย่าง (บน production ควรตั้งรหัสใหม่ผ่าน environment)
const ADMIN_USERNAME = 'admin';
// รหัสผ่านผู้ดูแล อ่านจาก environment ถ้ามี ไม่งั้นใช้ค่าตัวอย่าง
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@1234';

// ลิงก์ตัวอย่างของผู้ใช้ demo โดยลิงก์แรกตรงกับตัวอย่างในโจทย์
const DEMO_LINKS = [
  // ลิงก์ตัวอย่างตามโจทย์ ใช้ alias อ่านง่าย (URL ในรูปแบบมาตรฐาน มี / ท้าย ตรงกับที่ระบบบันทึก)
  { originalUrl: 'https://www.synerry.com/', shortCode: 'synerry', title: 'Synerry Corporation', tags: ['Synerry', 'เว็บไซต์'] },
  // ลิงก์ตัวอย่างแบบรหัสสุ่ม
  { originalUrl: 'https://github.com/', shortCode: 'Gh7kQ2', title: 'GitHub', tags: ['Dev'] },
  // ลิงก์ตัวอย่างที่ปิดการใช้งาน ใช้สาธิตหน้าลิงก์ใช้งานไม่ได้
  { originalUrl: 'https://www.google.com/', shortCode: 'Off9xP', title: 'Disabled example', isActive: false, tags: [] as string[] },
  // ลิงก์ตัวอย่างที่ตั้งเวลาเปิดไว้ล่วงหน้า 30 วัน ใช้สาธิตหน้า "ยังไม่เปิดใช้งาน"
  {
    originalUrl: 'https://www.synerry.com/th/',
    shortCode: 'launch',
    title: 'Scheduled example',
    startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    tags: ['Synerry'],
  },
];

try {
  // hash รหัสผ่านด้วย cost 10 ซึ่งเป็นค่ามาตรฐานที่สมดุลระหว่างความปลอดภัยและความเร็ว
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // สร้างผู้ใช้ demo ถ้ามีอยู่แล้วให้รีเซ็ตรหัสผ่าน และเปิดบัญชีคืน (เผื่อถูกระงับระหว่างทดลองหน้าผู้ดูแล)
  await db
    .insert(users)
    .values({ username: DEMO_USERNAME, passwordHash })
    .onConflictDoUpdate({ target: users.username, set: { passwordHash, isActive: true, role: 'user', onboardedAt: null } });

  // สร้างบัญชีผู้ดูแลตัวอย่าง ให้ผู้ตรวจงานลองหน้าผู้ดูแลได้
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await db
    .insert(users)
    .values({ username: ADMIN_USERNAME, passwordHash: adminHash, role: 'admin' })
    .onConflictDoUpdate({ target: users.username, set: { passwordHash: adminHash, isActive: true, role: 'admin', onboardedAt: null } });

  // ดึงรหัสของผู้ใช้ demo เพื่อใช้เป็นเจ้าของลิงก์
  const [demo] = await db.select({ id: users.id }).from(users).where(eq(users.username, DEMO_USERNAME));

  // เพิ่มลิงก์ตัวอย่างทีละตัว ถ้ารหัสสั้นมีอยู่แล้ว ให้รีเซ็ตกลับเป็นค่าตัวอย่าง (ไม่ลบประวัติคลิก เพราะรหัสลิงก์ไม่เปลี่ยน)
  for (const l of DEMO_LINKS) {
    await db
      .insert(links)
      .values({ ...l, userId: demo.id })
      .onConflictDoUpdate({
        // ชนที่รหัสสั้น
        target: links.shortCode,
        // รีเซ็ตค่าที่ใช้สาธิต และดึงกลับออกจากถังขยะถ้าเคยถูกลบระหว่างทดลอง
        set: { originalUrl: l.originalUrl, title: l.title, tags: l.tags, isActive: l.isActive ?? true, startsAt: l.startsAt ?? null, expiresAt: null, deletedAt: null },
      });
  }

  // แสดงผลลัพธ์
  console.log(`[gateway] seed done: user "${DEMO_USERNAME}" (id ${demo.id}), demo links: ${DEMO_LINKS.length}`);
} finally {
  // ปิด connection pool เพื่อให้ script จบการทำงานได้
  await sql.end();
}
