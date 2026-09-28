// นำเข้าตัวช่วยสร้างตารางและชนิดคอลัมน์ของ PostgreSQL จาก Drizzle
import { bigserial, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ตาราง clicks เก็บเหตุการณ์การคลิกหรือเปิดลิงก์สั้นแต่ละครั้ง
export const clicks = pgTable(
  'clicks',
  {
    // รหัสการคลิก ใช้ bigserial เพราะจำนวนคลิกโตเร็วกว่าจำนวนลิงก์มาก
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    // อ้างอิง links.id ใน gateway_db แบบ logical ไม่มี foreign key เพราะอยู่คนละฐานข้อมูล
    linkId: integer('link_id').notNull(),
    // เวลาที่คลิก
    clickedAt: timestamp('clicked_at', { withTimezone: true }).notNull().defaultNow(),
    // IP ที่ผ่านการ hash แล้ว ใช้นับผู้เข้าชมไม่ซ้ำได้โดยไม่เก็บ IP จริง
    ipHash: varchar('ip_hash', { length: 64 }),
    // ข้อมูล browser แบบดิบ เก็บไว้เผื่อวิเคราะห์เพิ่มภายหลัง
    userAgent: text('user_agent'),
    // หน้าเว็บที่ส่งผู้ใช้มา ถ้าเปิดตรงหรือสแกน QR มักจะว่าง
    referer: text('referer'),
    // ประเภทอุปกรณ์ เช่น desktop mobile tablet
    deviceType: varchar('device_type', { length: 20 }),
    // ชื่อ browser เช่น Chrome Safari
    browser: varchar('browser', { length: 50 }),
    // ระบบปฏิบัติการ เช่น Windows iOS Android
    os: varchar('os', { length: 50 }),
    // ประเทศของผู้คลิก รหัส ISO 2 ตัว เช่น TH หาจาก IP ก่อน hash ถ้าหาไม่ได้เป็น null
    country: varchar('country', { length: 2 }),
  },
  // index สำหรับดึงสถิติของลิงก์หนึ่งตามช่วงเวลา ซึ่งเป็น query ที่ใช้บ่อยที่สุด
  (t) => [index('clicks_link_time_idx').on(t.linkId, t.clickedAt)],
);

// ชนิดข้อมูลของแถวในตาราง clicks สำหรับใช้ในโค้ดส่วนอื่น
export type Click = typeof clicks.$inferSelect;
