// สคริปต์ใส่ข้อมูลคลิกตัวอย่างให้ลิงก์ของบัญชี demo เพื่อให้กราฟในหน้าสถิติมีข้อมูลตอนสาธิต
// ทำงานผ่าน API ภายในของ gateway และ analytics เท่านั้น ไม่เขียนลงฐานข้อมูลของ service อื่นตรงๆ
// ต้องเปิด service ไว้ก่อน (npm run dev) แล้วรัน: npm run seed:clicks  (-- --force เพิ่มซ้ำ, -- --reset ลบของเดิมแล้วใส่ใหม่)

// URL ของ gateway ใช้ค้นรหัสลิงก์จากรหัสสั้น
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3001';
// URL ของ analytics ใช้ส่งคลิก
const ANALYTICS_URL = process.env.ANALYTICS_URL ?? 'http://localhost:3003';
// key ภายใน ต้องตรงกับที่ตั้งไว้ใน service
const KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key-change-me';
// ถ้าใส่ --force จะเพิ่มคลิกแม้มีข้อมูลอยู่แล้ว
const FORCE = process.argv.includes('--force');
// ถ้าใส่ --reset จะลบคลิกเดิมของลิงก์ตัวอย่างก่อน แล้วใส่ใหม่ทั้งหมด
const RESET = process.argv.includes('--reset');
// header ที่ใช้ทุก request
const headers = { 'x-internal-key': KEY, 'content-type': 'application/json' };

// ลิงก์ของ demo ที่จะใส่คลิก และจำนวนคลิกที่ต้องการ
const TARGETS = [
  { code: 'synerry', clicks: 140 },
  { code: 'Gh7kQ2', clicks: 45 },
];

// user agent ตัวอย่าง พร้อมน้ำหนัก (ค่ามาก = สุ่มได้บ่อย) ให้สัดส่วนใกล้ของจริงในไทยที่มือถือมากกว่า
const AGENTS = [
  [5, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
  [5, 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'],
  [4, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'],
  [2, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'],
  [1, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'],
  [1, 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
];

// แหล่งที่มาตัวอย่าง พร้อมน้ำหนัก ค่าว่างคือเปิดตรงหรือสแกน QR
const REFERERS = [
  [6, ''],
  [3, 'https://www.facebook.com/'],
  [2, 'https://line.me/'],
  [2, 'https://www.google.com/'],
  [1, 'https://www.linkedin.com/'],
];

// ช่วง IP สาธารณะของแต่ละประเทศ (ตรวจกับฐานข้อมูล GeoIP แล้ว) พร้อมน้ำหนัก ส่วนใหญ่เป็นผู้ใช้ในไทย
// analytics จะหาประเทศจาก IP เอง สคริปต์นี้ไม่ได้ส่งประเทศไปตรงๆ
const IP_RANGES = [
  [24, '1.46'], [23, '1.47'], [23, '171.96'],
  [6, '103.6'], [5, '133.242'], [5, '8.8'], [4, '60.48'], [4, '14.160'], [3, '39.192'], [3, '81.2'],
];

// สุ่ม IP จากช่วงที่เลือก โดยจำกัดส่วนท้ายไว้ไม่กี่ค่า ให้มีทั้งผู้เข้าชมใหม่และคนที่กลับมาซ้ำ
function randomIp() {
  // เลือกช่วงตามน้ำหนัก
  const prefix = pick(IP_RANGES);
  // สุ่มสองส่วนท้าย
  return `${prefix}.${10 + Math.floor(Math.random() * 3)}.${1 + Math.floor(Math.random() * 20)}`;
}

// สุ่มเลือกหนึ่งรายการตามน้ำหนัก
function pick(weighted) {
  // รวมน้ำหนักทั้งหมด
  const total = weighted.reduce((sum, [w]) => sum + w, 0);
  // สุ่มตัวเลขในช่วงน้ำหนักรวม
  let r = Math.random() * total;
  // ไล่ลบน้ำหนักจนเจอรายการที่ตัวเลขตกอยู่
  for (const [w, value] of weighted) {
    if ((r -= w) < 0) return value;
  }
  // กันกรณีปัดเศษ คืนรายการสุดท้าย
  return weighted.at(-1)[1];
}

// สุ่มเวลาคลิกภายใน 30 วันที่ผ่านมา ให้วันหลังๆ มีคลิกมากกว่า และเป็นช่วงกลางวันเวลาไทยมากกว่ากลางคืน
function randomTime() {
  // ยกกำลังเพื่อให้วันที่ใกล้ปัจจุบันถูกสุ่มบ่อยกว่า
  const daysAgo = Math.floor(Math.pow(Math.random(), 1.6) * 30);
  // สุ่มชั่วโมงเวลาไทย 8:00-23:00
  const hourTh = 8 + Math.floor(Math.random() * 15);
  // สร้างวันที่ย้อนหลังตามจำนวนวัน
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  // ตั้งชั่วโมงตามเวลาไทย (UTC+7) และสุ่มนาที
  d.setUTCHours(hourTh - 7, Math.floor(Math.random() * 60), 0, 0);
  // ถ้าเวลาที่ได้อยู่ในอนาคต (กรณีวันนี้) ให้ใช้เวลาปัจจุบันลบไม่กี่นาทีแทน
  return d.getTime() > Date.now() ? new Date(Date.now() - Math.random() * 3_600_000) : d;
}

// เรียก API แล้วคืน JSON ถ้า error ให้หยุดพร้อมข้อความที่เข้าใจได้
async function api(url, init) {
  // ตัวแปรเก็บ response
  let res;
  try {
    // ส่ง request
    res = await fetch(url, { ...init, headers });
  } catch {
    // เชื่อมต่อไม่ได้ ส่วนใหญ่เพราะยังไม่ได้เปิด service
    throw new Error(`Cannot reach ${url}. Start the services first with: npm run dev`);
  }
  // service ตอบ error
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} -> HTTP ${res.status}`);
  // คืนข้อมูล
  return res.json();
}

// ทำงานกับทีละลิงก์
for (const target of TARGETS) {
  // ขอรหัสลิงก์จาก gateway ผ่าน route ภายใน
  const link = await api(`${GATEWAY_URL}/internal/links/${target.code}`);
  // ถ้าสั่ง --reset ให้ลบคลิกเดิมของลิงก์นี้ผ่าน API ของ analytics ก่อน
  if (RESET) await api(`${ANALYTICS_URL}/internal/clicks/${link.id}`, { method: 'DELETE' });
  // ดูว่าลิงก์นี้มีคลิกอยู่แล้วหรือยัง
  const summary = await api(`${ANALYTICS_URL}/internal/stats/summary`, { method: 'POST', body: JSON.stringify({ linkIds: [link.id] }) });
  // ถ้ามีแล้วและไม่ได้สั่ง --force ให้ข้าม เพื่อให้รันซ้ำได้ปลอดภัย
  if (summary.totalClicks > 0 && !FORCE) {
    console.log(`skip ${target.code}: already has ${summary.totalClicks} clicks (use --force to add more)`);
    continue;
  }
  // ส่งคลิกทีละครั้ง
  for (let i = 0; i < target.clicks; i++) {
    await api(`${ANALYTICS_URL}/internal/clicks`, {
      method: 'POST',
      body: JSON.stringify({
        // รหัสลิงก์
        linkId: link.id,
        // เวลาคลิกที่สุ่มไว้
        clickedAt: randomTime().toISOString(),
        // สุ่ม IP จากช่วงของแต่ละประเทศ
        ip: randomIp(),
        // สุ่มอุปกรณ์
        userAgent: pick(AGENTS),
        // สุ่มแหล่งที่มา
        referer: pick(REFERERS) || undefined,
      }),
    });
  }
  // เพิ่ม preview ของ Slack 3 ครั้ง เพื่อสาธิตว่าระบบแยก bot ออกจากยอดคลิก
  for (let i = 0; i < 3; i++) {
    await api(`${ANALYTICS_URL}/internal/clicks`, {
      method: 'POST',
      body: JSON.stringify({ linkId: link.id, userAgent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' }),
    });
  }
  // แจ้งผล
  console.log(`seeded ${target.clicks} clicks + 3 bot previews for /${target.code} (link id ${link.id})`);
}
