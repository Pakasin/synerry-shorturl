// ปลุกทุก service ก่อนสาธิตระบบ: เรียก /health ของทุก service พร้อมกัน แล้วลองซ้ำจนตอบ 200 ครบ หรือจนครบเวลาที่กำหนด
// บน Render แบบฟรี service จะหลับเมื่อไม่มีคนใช้ 15 นาที การเรียกครั้งแรกหลังหลับใช้เวลา 30-60 วินาที
//
// ใช้กับเครื่องตัวเอง:     npm run warmup
// ใช้กับระบบออนไลน์:       npm run warmup -- https://gateway.example.com https://redirect.example.com https://analytics.example.com
// หรือตั้งตัวแปร WARMUP_URLS=url1,url2,url3 แล้วรัน npm run warmup

// เวลารอทั้งหมดสูงสุด (มิลลิวินาที)
const LIMIT_MS = Number(process.env.WARMUP_LIMIT_MS ?? 120_000);
// เวลารอแต่ละครั้งที่เรียก
const ATTEMPT_TIMEOUT_MS = 20_000;
// เว้นระยะก่อนลองใหม่
const RETRY_DELAY_MS = 3_000;

// รายการ URL: จาก argument ก่อน ถ้าไม่มีดูจากตัวแปร ถ้าไม่มีอีกใช้ของเครื่องตัวเอง
const urls = (
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : (process.env.WARMUP_URLS ?? 'http://localhost:3001,http://localhost:3002,http://localhost:3003').split(',')
)
  // ตัดช่องว่างและ / ท้าย
  .map((u) => u.trim().replace(/\/+$/, ''))
  // ตัดรายการว่าง
  .filter(Boolean);

// รอตามเวลาที่กำหนด
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// เวลาที่เริ่ม
const started = Date.now();

// ปลุก service หนึ่งตัว ลองซ้ำจนตอบ 200 หรือหมดเวลา
async function wake(base) {
  // จำนวนครั้งที่ลอง
  let attempts = 0;
  // ผลล่าสุด ใช้แสดงตอนไม่สำเร็จ
  let last = '';
  while (Date.now() - started < LIMIT_MS) {
    attempts += 1;
    try {
      // เรียก /health
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      // อ่านผล (ถ้าอ่าน JSON ไม่ได้ให้เป็น object ว่าง)
      const body = await res.json().catch(() => ({}));
      // ตอบ 200 ถือว่าพร้อม
      if (res.ok) return { base, ok: true, ms: Date.now() - started, attempts, service: body.service ?? '?', db: body.db ?? '?' };
      // ตอบ error (เช่น 503 ฐานข้อมูลยังไม่พร้อม) เก็บไว้แล้วลองใหม่
      last = `HTTP ${res.status}${body.db ? ` (db: ${body.db})` : ''}`;
    } catch (err) {
      // เชื่อมต่อไม่ได้หรือหมดเวลารอ
      last = err.name === 'TimeoutError' ? 'timeout' : err.message;
    }
    // รอก่อนลองใหม่
    await sleep(RETRY_DELAY_MS);
  }
  // หมดเวลาแล้วยังไม่พร้อม
  return { base, ok: false, ms: Date.now() - started, attempts, error: last };
}

console.log(`Waking ${urls.length} service(s), up to ${Math.round(LIMIT_MS / 1000)}s...`);
// ปลุกทุกตัวพร้อมกัน
const results = await Promise.all(urls.map(wake));

// แสดงผลทีละบรรทัด
for (const r of results) {
  // เวลาเป็นวินาที ทศนิยมหนึ่งตำแหน่ง
  const secs = (r.ms / 1000).toFixed(1).padStart(5);
  if (r.ok) console.log(`  OK    ${secs}s  ${r.service.padEnd(10)} db=${String(r.db).padEnd(5)} ${r.base}`);
  else console.log(`  FAIL  ${secs}s  ${r.base}  (${r.error}, ${r.attempts} attempts)`);
}

// ถ้ามีตัวไหนไม่พร้อม ให้จบด้วย exit code 1 (ใช้ต่อในสคริปต์อื่นได้)
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} service(s) not ready.` : 'All services are awake.');
process.exit(failed ? 1 : 0);
