// ระดับของ log ที่รองรับ
type Level = 'info' | 'warn' | 'error';

// สร้าง logger ที่ติดชื่อ service ไว้ทุกบรรทัด เพื่อแยกได้ว่า log มาจาก service ไหน
export function createLogger(service: string) {
  // ฟังก์ชันภายในสำหรับพิมพ์ log หนึ่งบรรทัดในรูปแบบ JSON
  const write = (level: Level, message: string, extra?: Record<string, unknown>) => {
    // รวมเวลา ระดับ ชื่อ service ข้อความ และข้อมูลเพิ่มเติมไว้ใน object เดียว
    const line = { time: new Date().toISOString(), level, service, message, ...extra };
    // ถ้าเป็น error ให้พิมพ์ออก stderr นอกนั้นพิมพ์ออก stdout
    (level === 'error' ? console.error : console.log)(JSON.stringify(line));
  };
  // คืนค่าฟังก์ชัน log แยกตามระดับ
  return {
    // log ข้อมูลทั่วไป
    info: (message: string, extra?: Record<string, unknown>) => write('info', message, extra),
    // log คำเตือน
    warn: (message: string, extra?: Record<string, unknown>) => write('warn', message, extra),
    // log ข้อผิดพลาด
    error: (message: string, extra?: Record<string, unknown>) => write('error', message, extra),
  };
}
