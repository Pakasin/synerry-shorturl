// ตัวอักษรนำหน้าที่ Excel อ่านเป็นสูตรคำนวณ ถ้าปล่อยไว้ ข้อมูลที่ผู้ใช้กรอกอาจกลายเป็นสูตรที่รันคำสั่งได้ (CSV injection)
const FORMULA_START = /^[=+\-@\t\r]/;

// แปลงค่าหนึ่งช่องให้ปลอดภัยสำหรับ CSV
export function csvCell(value: unknown): string {
  // ค่าว่างให้เป็นช่องว่าง
  if (value === null || value === undefined) return '';
  // วันที่ให้เป็นรูปแบบ ISO ที่โปรแกรมอื่นอ่านได้
  let text = value instanceof Date ? value.toISOString() : String(value);
  // ถ้าขึ้นต้นด้วยตัวอักษรของสูตร ให้ใส่ ' นำหน้า เพื่อให้ Excel แสดงเป็นข้อความธรรมดา
  if (FORMULA_START.test(text)) text = `'${text}`;
  // ถ้ามี , " หรือขึ้นบรรทัดใหม่ ต้องครอบด้วย " และเปลี่ยน " ข้างในเป็น ""
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  // คืนค่าที่ปลอดภัยแล้ว
  return text;
}

// สร้างข้อความ CSV ทั้งไฟล์จากหัวตารางและแถวข้อมูล
export function toCsv(header: string[], rows: unknown[][]): string {
  // แปลงทุกแถวเป็นบรรทัด คั่นช่องด้วย ,
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  // ใส่ BOM ไว้หน้าไฟล์ ให้ Excel รู้ว่าเป็น UTF-8 และแสดงภาษาไทยถูกต้อง ขึ้นบรรทัดแบบ CRLF ตามมาตรฐาน CSV
  return '﻿' + lines.join('\r\n') + '\r\n';
}
