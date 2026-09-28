// นำเข้าชนิดข้อมูลแถวของตาราง links
import type { Link } from '../db/schema';
// นำเข้าค่าตั้งค่าเพื่อประกอบลิงก์สั้นเต็ม
import { config } from '../config';

// สถานะของลิงก์ที่คำนวณจากข้อมูล ใช้แสดงผลในหน้าเว็บ
export type LinkStatus = 'active' | 'locked' | 'disabled' | 'expired' | 'scheduled';

// คำนวณสถานะของลิงก์ ณ เวลาปัจจุบัน (ลำดับการตรวจสำคัญ: ถูกผู้ดูแลระงับ > ปิดใช้งาน > หมดอายุ > ยังไม่ถึงเวลาเริ่ม)
export function linkStatus(link: Pick<Link, 'isActive' | 'expiresAt' | 'startsAt' | 'lockedAt'>, now = new Date()): LinkStatus {
  // ถูกผู้ดูแลระงับ
  if (link.lockedAt) return 'locked';
  // ถูกปิดโดยเจ้าของ
  if (!link.isActive) return 'disabled';
  // มีวันหมดอายุและเลยมาแล้ว
  if (link.expiresAt && link.expiresAt <= now) return 'expired';
  // มีวันเริ่มและยังไม่ถึง
  if (link.startsAt && link.startsAt > now) return 'scheduled';
  // ใช้งานได้ปกติ
  return 'active';
}

// แปลงแถวในฐานข้อมูลเป็นข้อมูลที่ส่งให้ frontend โดยไม่ส่ง userId ออกไป
export function toLinkDto(link: Link) {
  return {
    // รหัสลิงก์
    id: link.id,
    // URL ต้นฉบับ
    originalUrl: link.originalUrl,
    // รหัสสั้น
    shortCode: link.shortCode,
    // ลิงก์สั้นเต็ม พร้อมคัดลอกหรือทำ QR ได้ทันที
    shortUrl: `${config.shortBaseUrl}/${link.shortCode}`,
    // ชื่อเรียก
    title: link.title,
    // แท็ก
    tags: link.tags,
    // เปิดหรือปิดใช้งาน
    isActive: link.isActive,
    // วันเริ่มใช้งาน
    startsAt: link.startsAt,
    // วันหมดอายุ
    expiresAt: link.expiresAt,
    // สถานะที่คำนวณแล้ว
    status: linkStatus(link),
    // เวลาที่ย้ายลงถังขยะ (null = ยังไม่ถูกลบ)
    deletedAt: link.deletedAt,
    // เวลาที่ผู้ดูแลระงับ (null = ไม่ถูกระงับ)
    lockedAt: link.lockedAt,
    // เหตุผลที่ระงับ ให้เจ้าของรู้ว่าทำไม
    lockReason: link.lockReason,
    // เวลาสร้าง
    createdAt: link.createdAt,
    // เวลาแก้ไขล่าสุด
    updatedAt: link.updatedAt,
  };
}
