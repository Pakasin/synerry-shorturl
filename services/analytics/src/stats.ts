// นำเข้า connection แบบเขียน SQL เอง ใช้กับ query สถิติที่ซับซ้อน
import { sql } from './db/client';
// นำเข้าค่าตั้งค่า
import { config } from './config';

// รายการนับแยกตามกลุ่ม เช่น { name: 'mobile', count: 12 }
type Breakdown = { name: string; count: number }[];

// รวมสถิติทั้งหมดของลิงก์หนึ่งลิงก์ย้อนหลังตามจำนวนวันที่กำหนด (ไม่นับ bot)
export async function getLinkStats(linkId: number, days: number) {
  // เขตเวลาที่ใช้ตัดวัน
  const tz = config.timezone;

  // ยอดรวมทั้งหมดตั้งแต่สร้างลิงก์: จำนวนคลิก ผู้เข้าชมไม่ซ้ำ คลิกล่าสุด และจำนวนที่เป็น bot
  const totalsQuery = sql<{ total: number; uniq: number; last: Date | null; bots: number }[]>`
    select
      count(*) filter (where device_type is distinct from 'bot')::int as total,
      count(distinct ip_hash) filter (where device_type is distinct from 'bot')::int as uniq,
      max(clicked_at) filter (where device_type is distinct from 'bot') as last,
      count(*) filter (where device_type = 'bot')::int as bots
    from clicks where link_id = ${linkId}`;

  // จำนวนคลิกรายวัน สร้างทุกวันในช่วงด้วย generate_series แล้ว left join เพื่อให้วันที่ไม่มีคลิกเป็น 0
  const dailyQuery = sql<{ date: string; clicks: number }[]>`
    select to_char(d, 'YYYY-MM-DD') as date, count(c.id)::int as clicks
    from generate_series(
      (now() at time zone ${tz})::date - ${days - 1}::int,
      (now() at time zone ${tz})::date,
      interval '1 day'
    ) as d
    left join clicks c
      on c.link_id = ${linkId}
      and c.device_type is distinct from 'bot'
      and (c.clicked_at at time zone ${tz})::date = d::date
    group by d order by d`;

  // ฟังก์ชันย่อยนับแยกตามคอลัมน์ที่ระบุ ภายในช่วงวันที่เลือก เรียงจากมากไปน้อย
  const breakdown = (column: 'device_type' | 'browser' | 'os') => sql<Breakdown>`
    select coalesce(${sql(column)}, 'Unknown') as name, count(*)::int as count
    from clicks
    where link_id = ${linkId}
      and device_type is distinct from 'bot'
      and clicked_at >= now() - make_interval(days => ${days})
    group by 1 order by 2 desc, 1 limit 10`;

  // แหล่งที่มา: ตัดเอาเฉพาะโดเมนจาก referer ถ้าไม่มี referer ถือว่าเข้าตรง (พิมพ์เอง หรือสแกน QR)
  const referersQuery = sql<Breakdown>`
    select coalesce(substring(referer from '^https?://([^/:?#]+)'), 'Direct') as name, count(*)::int as count
    from clicks
    where link_id = ${linkId}
      and device_type is distinct from 'bot'
      and clicked_at >= now() - make_interval(days => ${days})
    group by 1 order by 2 desc, 1 limit 10`;

  // ประเทศ: นับทุกประเทศ (ไม่จำกัด 10) เพื่อใช้วาดแผนที่ ประเทศที่หาไม่ได้รวมเป็น Unknown
  // เรียงจากมากไปน้อย ถ้าเท่ากันให้ Unknown อยู่ท้าย แล้วเรียงตามรหัสประเทศ ผลลัพธ์จะเหมือนเดิมทุกครั้ง
  const countriesQuery = sql<Breakdown>`
    select coalesce(country, 'Unknown') as name, count(*)::int as count
    from clicks
    where link_id = ${linkId}
      and device_type is distinct from 'bot'
      and clicked_at >= now() - make_interval(days => ${days})
    group by country order by 2 desc, country is null, country`;

  // คลิกล่าสุด 10 รายการ สำหรับตารางในหน้ารายละเอียด (ไม่ส่ง ip_hash ออกไป)
  const recentQuery = sql<{ clickedAt: Date; deviceType: string; browser: string | null; os: string | null; referer: string | null; country: string | null }[]>`
    select clicked_at as "clickedAt", device_type as "deviceType", browser, os, referer, country
    from clicks
    where link_id = ${linkId} and device_type is distinct from 'bot'
    order by clicked_at desc limit 10`;

  // รันทุก query พร้อมกันเพื่อให้ตอบเร็วขึ้น
  const [[totals], daily, devices, browsers, os, referers, countries, recent] = await Promise.all([
    totalsQuery, dailyQuery, breakdown('device_type'), breakdown('browser'), breakdown('os'), referersQuery, countriesQuery, recentQuery,
  ]);

  // รวมผลลัพธ์เป็น object เดียว
  return {
    // ช่วงวันที่ใช้คำนวณกราฟและการแบ่งกลุ่ม
    days,
    // ยอดคลิกรวม (ไม่รวม bot)
    totalClicks: totals.total,
    // จำนวนผู้เข้าชมไม่ซ้ำ นับจาก IP ที่ hash แล้ว
    uniqueVisitors: totals.uniq,
    // เวลาคลิกล่าสุด
    lastClickAt: totals.last,
    // จำนวนครั้งที่ bot หรือตัวทำ preview เปิดลิงก์ แสดงแยกไว้ให้รู้
    botClicks: totals.bots,
    // จำนวนคลิกรายวัน
    daily,
    // แยกตามประเภทอุปกรณ์
    devices,
    // แยกตามประเทศ
    countries,
    // แยกตาม browser
    browsers,
    // แยกตามระบบปฏิบัติการ
    os,
    // แยกตามแหล่งที่มา
    referers,
    // คลิกล่าสุด
    recent,
  };
}

// นับจำนวนคลิกของหลายลิงก์ในครั้งเดียว ใช้ในหน้าประวัติและหน้าสรุป (ไม่นับ bot)
export async function getClickCounts(linkIds: number[]): Promise<Record<string, number>> {
  // ถ้าไม่มีลิงก์ ไม่ต้องถามฐานข้อมูล
  if (linkIds.length === 0) return {};
  // นับแยกตามลิงก์ โดยใช้ = any() กับ array เพื่อส่งรายการ id เป็น parameter เดียว
  const rows = await sql<{ linkId: number; count: number }[]>`
    select link_id as "linkId", count(*)::int as count
    from clicks
    where link_id = any(${linkIds}::int[]) and device_type is distinct from 'bot'
    group by link_id`;
  // เริ่มจากให้ทุกลิงก์มีค่า 0 เพื่อให้ลิงก์ที่ยังไม่มีคลิกได้ 0 ไม่ใช่หายไป
  const counts: Record<string, number> = Object.fromEntries(linkIds.map((id) => [String(id), 0]));
  // ใส่ค่าที่นับได้
  for (const row of rows) counts[String(row.linkId)] = row.count;
  // คืนผลลัพธ์
  return counts;
}
