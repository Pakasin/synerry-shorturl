// นำเข้าตัวช่วยสร้างตารางและชนิดคอลัมน์ของ PostgreSQL จาก Drizzle
import { boolean, index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
// นำเข้าตัวเขียน SQL ดิบ ใช้กำหนดค่าเริ่มต้นของ array
import { sql } from 'drizzle-orm';

// ตาราง users เก็บบัญชีผู้ใช้ที่สมัครเข้าระบบ
export const users = pgTable('users', {
  // รหัสผู้ใช้ เพิ่มค่าอัตโนมัติ
  id: serial('id').primaryKey(),
  // ชื่อผู้ใช้สำหรับ login ห้ามซ้ำกัน
  username: varchar('username', { length: 30 }).notNull().unique(),
  // รหัสผ่านที่ผ่านการ hash ด้วย bcrypt แล้ว ไม่เก็บรหัสผ่านจริง
  passwordHash: text('password_hash').notNull(),
  // บทบาท: user = ผู้ใช้ทั่วไป, admin = ผู้ดูแลระบบ (สมัครเองได้แค่ user เท่านั้น)
  role: varchar('role', { length: 10 }).notNull().default('user'),
  // บัญชีใช้งานได้หรือไม่ ผู้ดูแลระงับบัญชีได้ บัญชีที่ถูกระงับ login ไม่ได้และลิงก์ทั้งหมดหยุดทำงาน
  isActive: boolean('is_active').notNull().default(true),
  // เวลาที่ดูคู่มือแนะนำการใช้งานจบ (หรือกดข้าม) ถ้าเป็น null จะแสดงคู่มือตอนเข้าใช้งาน
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  // เวลาที่สมัคร เก็บแบบมี timezone
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ตาราง links เก็บ URL ต้นฉบับและรหัสสั้นที่สร้างขึ้น
export const links = pgTable(
  'links',
  {
    // รหัสลิงก์ เพิ่มค่าอัตโนมัติ และเป็นค่าที่ analytics ใช้อ้างอิง
    id: serial('id').primaryKey(),
    // เจ้าของลิงก์ ถ้าลบผู้ใช้ ลิงก์ของเขาจะถูกลบตามไปด้วย
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // URL ต้นฉบับที่ผู้ใช้กรอก ใช้ text เพราะ URL อาจยาวมาก
    originalUrl: text('original_url').notNull(),
    // รหัสสั้นท้าย URL เช่น rAJMO หรือ alias ที่ผู้ใช้ตั้งเอง ห้ามซ้ำกัน
    shortCode: varchar('short_code', { length: 30 }).notNull().unique(),
    // ชื่อเรียกลิงก์ ไม่บังคับกรอก
    title: varchar('title', { length: 200 }),
    // สถานะเปิดหรือปิดการใช้งานลิงก์ ปิดแล้วจะ redirect ไม่ได้
    isActive: boolean('is_active').notNull().default(true),
    // วันหมดอายุ ถ้าเป็น null แปลว่าไม่มีวันหมดอายุ
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // วันเริ่มใช้งาน ก่อนถึงเวลานี้ลิงก์จะยังเปิดไม่ได้ ถ้าเป็น null ใช้ได้ทันที
    startsAt: timestamp('starts_at', { withTimezone: true }),
    // แท็กสำหรับจัดกลุ่มลิงก์ เก็บเป็น array ของข้อความ
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    // เวลาที่ย้ายลงถังขยะ ถ้าเป็น null แปลว่ายังไม่ถูกลบ (ลบแบบกู้คืนได้)
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // เวลาที่ผู้ดูแลระงับลิงก์ (เช่น ลิงก์หลอกลวง) ถ้ามีค่า ลิงก์ใช้ไม่ได้และเจ้าของเปิดเองไม่ได้
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    // เหตุผลที่ระงับ แสดงให้เจ้าของลิงก์เห็น
    lockReason: varchar('lock_reason', { length: 300 }),
    // ผู้ดูแลที่ระงับ ถ้าบัญชีผู้ดูแลถูกลบ ให้เป็น null แต่การระงับยังอยู่
    lockedBy: integer('locked_by').references(() => users.id, { onDelete: 'set null' }),
    // เวลาที่สร้างลิงก์
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // เวลาที่แก้ไขล่าสุด อัปเดตอัตโนมัติทุกครั้งที่ update ผ่าน Drizzle
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // index สำหรับหน้าประวัติ ที่ดึงลิงก์ของผู้ใช้หนึ่งคนเรียงตามเวลาสร้าง
    index('links_user_created_idx').on(t.userId, t.createdAt),
    // index แบบ GIN สำหรับค้นลิงก์ที่มีแท็กที่ระบุ
    index('links_tags_idx').using('gin', t.tags),
  ],
);

// ตาราง sessions เก็บการ login ที่ยังใช้งานอยู่ ลบแถวทิ้ง = logout ทันที
export const sessions = pgTable(
  'sessions',
  {
    // ค่า sha256 ของ token ใน cookie เก็บแค่ hash เพื่อให้ข้อมูลหลุดก็เอาไปใช้ไม่ได้
    id: varchar('id', { length: 64 }).primaryKey(),
    // เจ้าของ session ถ้าลบผู้ใช้ session ทั้งหมดของเขาจะถูกลบตาม
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // เวลาหมดอายุ เลยเวลานี้แล้วถือว่า session ใช้ไม่ได้
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // เวลาที่ login
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // index สำหรับค้นหาหรือลบ session ทั้งหมดของผู้ใช้หนึ่งคน
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ตาราง blocked_domains เก็บโดเมนที่ผู้ดูแลเพิ่มเข้า blocklist จากหน้าเว็บ (เพิ่มเติมจากรายการที่ติดมากับโค้ด)
export const blockedDomains = pgTable('blocked_domains', {
  // รหัสรายการ
  id: serial('id').primaryKey(),
  // ชื่อโดเมน ตัวเล็กทั้งหมด ห้ามซ้ำ (ความยาวสูงสุดของชื่อโดเมนคือ 253 ตัว)
  domain: varchar('domain', { length: 253 }).notNull().unique(),
  // เหตุผลที่บล็อก
  reason: varchar('reason', { length: 300 }),
  // ผู้ดูแลที่เพิ่ม ถ้าบัญชีถูกลบให้เป็น null แต่รายการยังอยู่
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  // เวลาที่เพิ่ม
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ชนิดข้อมูลของแถวในตาราง users สำหรับใช้ในโค้ดส่วนอื่น
export type User = typeof users.$inferSelect;
// ชนิดข้อมูลของแถวในตาราง links สำหรับใช้ในโค้ดส่วนอื่น
export type Link = typeof links.$inferSelect;
