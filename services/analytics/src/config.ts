// อ่านค่าตั้งค่าของ analytics จาก environment ไว้ที่เดียว
export const config = {
  // key ลับที่ใช้ยืนยันว่าผู้เรียกเป็น service ของเรา
  internalApiKey: process.env.INTERNAL_API_KEY,
  // ค่า salt ที่ผสมก่อน hash IP ทำให้ย้อนหา IP จริงจาก hash ไม่ได้ด้วยการลองทุก IP
  ipHashSalt: process.env.IP_HASH_SALT ?? 'dev-salt-change-me',
  // เขตเวลาที่ใช้ตัดวันในกราฟรายวัน ผู้ใช้อยู่ประเทศไทยจึงใช้เวลาไทย
  timezone: process.env.STATS_TIMEZONE ?? 'Asia/Bangkok',
};
