// รูปแบบข้อมูลที่ endpoint /health ของทุก service จะตอบกลับ
export type HealthStatus = {
  // ok = ใช้งานได้ปกติ, degraded = service รันอยู่แต่ส่วนที่พึ่งพา (เช่น DB) มีปัญหา
  status: 'ok' | 'degraded';
  // ชื่อ service ที่ตอบ
  service: string;
  // สถานะฐานข้อมูล ถ้า service ไม่มีฐานข้อมูลจะเป็น 'none'
  db: 'up' | 'down' | 'none';
  // เวลาที่ service รันมาแล้ว หน่วยเป็นวินาที
  uptimeSeconds: number;
  // เวลาปัจจุบันของเซิร์ฟเวอร์
  timestamp: string;
};

// สร้างผลลัพธ์ /health จากชื่อ service และสถานะฐานข้อมูล
export function buildHealth(service: string, db: HealthStatus['db']): HealthStatus {
  return {
    // ถ้าฐานข้อมูลล่ม ถือว่า service อยู่ในสถานะ degraded
    status: db === 'down' ? 'degraded' : 'ok',
    // ใส่ชื่อ service
    service,
    // ใส่สถานะฐานข้อมูล
    db,
    // ปัดเศษเวลาที่รันมาให้เป็นจำนวนเต็มวินาที
    uptimeSeconds: Math.round(process.uptime()),
    // เวลาปัจจุบันในรูปแบบ ISO
    timestamp: new Date().toISOString(),
  };
}
