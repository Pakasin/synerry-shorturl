// นำเข้า Hono สำหรับสร้างกลุ่ม route
import { Hono } from 'hono';
// นำเข้าตัวสร้างเงื่อนไข query
import { and, eq, isNull } from 'drizzle-orm';
// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง links
import { links } from '../db/schema';
// นำเข้าตัวแปลงข้อมูลลิงก์และตัวคำนวณสถานะ
import { linkStatus, toLinkDto } from '../links/dto';
// นำเข้า middleware บังคับ login
import { requireAuth } from '../middleware/requireAuth';
// นำเข้าตัวเรียก analytics
import { getClickCounts } from '../services/analytics';
// นำเข้าชนิดข้อมูลของ context
import type { AppEnv } from '../types';

// กลุ่ม route สรุปภาพรวมสำหรับหน้า dashboard
export function statsRoutes() {
  // สร้าง router ย่อย
  const r = new Hono<AppEnv>();
  // ต้อง login ก่อน
  r.use('*', requireAuth);

  // สรุปภาพรวมของผู้ใช้: จำนวนลิงก์ ลิงก์ที่ใช้งานได้ ยอดคลิกรวม และ 5 ลิงก์ที่คลิกมากที่สุด
  r.get('/summary', async (c) => {
    // ดึงลิงก์ทั้งหมดของผู้ใช้ ที่ยังไม่อยู่ในถังขยะ
    const rows = await db.select().from(links).where(and(eq(links.userId, c.get('user').id), isNull(links.deletedAt)));
    // ขอยอดคลิกของทุกลิงก์จาก analytics ในครั้งเดียว
    const clickData = await getClickCounts(rows.map((l) => l.id));
    // นับลิงก์ที่สถานะใช้งานได้
    const activeLinks = rows.filter((l) => linkStatus(l) === 'active').length;
    // เรียงลิงก์ตามยอดคลิกจากมากไปน้อย เอา 5 อันดับแรก (ถ้า analytics ไม่พร้อมจะเป็นรายการว่าง)
    const topLinks = clickData
      ? rows
          .map((l) => ({ ...toLinkDto(l), clicks: clickData.counts[l.id] ?? 0 }))
          .filter((l) => l.clicks > 0)
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 5)
      : [];
    // ตอบข้อมูลสรุป ยอดคลิกเป็น null ถ้า analytics ไม่พร้อม
    return c.json({
      totalLinks: rows.length,
      activeLinks,
      totalClicks: clickData?.totalClicks ?? null,
      topLinks,
      analyticsAvailable: clickData !== null,
    });
  });

  // คืน router ที่ตั้งค่าเสร็จแล้ว
  return r;
}
