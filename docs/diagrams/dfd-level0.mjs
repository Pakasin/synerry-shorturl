import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'images', 'dfd-level0.svg');

const NAVY = '#1b2340';
const RED = '#e31e24';
const LINE = '#4b5468';
const STORE_BG = '#f2f4f8';
const FONT = "'Leelawadee UI','Noto Sans Thai','Sarabun',sans-serif";

const W = 1860;
const H = 900;

const entities = {
  U: { x: 30, y: 330, w: 170, h: 90, lines: ['ผู้ใช้งาน', '(User)'] },
  V: { x: 1660, y: 50, w: 170, h: 90, lines: ['ผู้เปิดลิงก์สั้น', '(Visitor)'] },
  A: { x: 1660, y: 640, w: 170, h: 90, lines: ['ผู้ดูแลระบบ', '(Admin)'] },
};

const processes = {
  P1: { x: 330, y: 40, w: 210, h: 100, id: '1.0', lines: ['จัดการบัญชี', 'และการเข้าสู่ระบบ'] },
  P2: { x: 330, y: 230, w: 210, h: 100, id: '2.0', lines: ['สร้างและจัดการ', 'ลิงก์สั้น'] },
  P3: { x: 330, y: 440, w: 210, h: 90, id: '3.0', lines: ['สร้าง QR Code'] },
  P6: { x: 330, y: 620, w: 210, h: 100, id: '6.0', lines: ['แสดงประวัติ สถิติ', 'และส่งออกไฟล์'] },
  P4: { x: 1300, y: 40, w: 210, h: 110, id: '4.0', lines: ['พาไปยัง', 'URL ต้นฉบับ'] },
  P5: { x: 1300, y: 330, w: 210, h: 90, id: '5.0', lines: ['บันทึกการคลิก'] },
  P7: { x: 1300, y: 630, w: 210, h: 110, id: '7.0', lines: ['ดูแลระบบ'] },
};

const stores = {
  D1: { x: 770, y: 55, w: 240, h: 46, id: 'D1', name: 'users' },
  D2: { x: 770, y: 145, w: 240, h: 46, id: 'D2', name: 'sessions' },
  D3: { x: 770, y: 300, w: 240, h: 46, id: 'D3', name: 'links' },
  D5: { x: 770, y: 470, w: 240, h: 46, id: 'D5', name: 'blocked_domains' },
  D4: { x: 770, y: 660, w: 240, h: 46, id: 'D4', name: 'clicks' },
  D1b: { x: 1150, y: 810, w: 200, h: 46, id: 'D1', name: 'users', dup: true },
  D2b: { x: 1400, y: 810, w: 200, h: 46, id: 'D2', name: 'sessions', dup: true },
};

const boxes = { ...entities, ...processes, ...stores };

function anchor(key, side, t = 0.5) {
  const b = boxes[key];
  if (side === 'l') return [b.x, b.y + b.h * t];
  if (side === 'r') return [b.x + b.w, b.y + b.h * t];
  if (side === 't') return [b.x + b.w * t, b.y];
  return [b.x + b.w * t, b.y + b.h];
}

const flows = [
  { from: ['U', 't', 0.25], via: [[72, 70]], to: ['P1', 'l', 0.3], label: 'ชื่อผู้ใช้ รหัสผ่าน', seg: 1, lt: 0.55 },
  { from: ['P1', 'l', 0.75], via: [[115, 115]], to: ['U', 't', 0.5], label: 'session', seg: 0, lt: 0.45 },
  { from: ['U', 'r', 0.2], to: ['P2', 'l', 0.3], label: 'URL และตัวเลือก', lt: 0.5 },
  { from: ['P2', 'l', 0.75], to: ['U', 'r', 0.45], label: 'ลิงก์สั้น', lt: 0.45 },
  { from: ['P3', 'l', 0.5], to: ['U', 'r', 0.8], label: 'QR Code', lt: 0.5 },
  { from: ['U', 'b', 0.25], via: [[72, 700]], to: ['P6', 'l', 0.8], label: 'คำขอดูประวัติ สถิติ', seg: 1, lt: 0.55 },
  { from: ['P6', 'l', 0.35], via: [[115, 655]], to: ['U', 'b', 0.5], label: 'ประวัติ กราฟ ไฟล์', seg: 0, lt: 0.45 },
  { from: ['P2', 'b', 0.5], to: ['P3', 't', 0.5], label: 'ลิงก์สั้น', lt: 0.5 },
  { from: ['P1', 'r', 0.38], to: ['D1', 'l', 0.5], label: 'อ่าน / เขียน', both: true, lt: 0.5 },
  { from: ['P1', 'r', 0.8], to: ['D2', 'l', 0.5], label: 'อ่าน / เขียน', both: true, lt: 0.5 },
  { from: ['P2', 'r', 0.9], to: ['D3', 'l', 0.39], label: 'อ่าน / เขียน', both: true, lt: 0.45 },
  {
    from: ['D5', 'l', 0.4],
    via: [
      [690, 488],
      [690, 262],
    ],
    to: ['P2', 'r', 0.32],
    label: 'โดเมนที่บล็อก',
    seg: 1,
    lt: 0.2,
  },
  {
    from: ['P2', 'b', 0.85],
    via: [[508, 395]],
    to: ['P5', 'l', 0.72],
    label: 'ลิงก์ที่ลบถาวร (ให้ลบคลิกตาม)',
    seg: 1,
    lt: 0.24,
  },
  {
    from: ['D3', 'l', 0.8],
    via: [
      [620, 337],
      [620, 645],
    ],
    to: ['P6', 'r', 0.25],
    label: 'ลิงก์ของผู้ใช้',
    seg: 1,
    lt: 0.72,
  },
  { from: ['D4', 'l', 0.5], to: ['P6', 'r', 0.62], label: 'สถิติการคลิก', lt: 0.5 },
  { from: ['V', 'l', 0.3], to: ['P4', 'r', 0.3], label: 'รหัสลิงก์สั้น', lt: 0.5 },
  { from: ['P4', 'r', 0.7], to: ['V', 'l', 0.8], label: 'ไปยังปลายทาง', lt: 0.5 },
  { from: ['D1', 'r', 0.35], to: ['P4', 'l', 0.3], label: 'สถานะเจ้าของลิงก์', lt: 0.5 },
  {
    from: ['D3', 'r', 0.3],
    via: [
      [1110, 314],
      [1110, 105],
    ],
    to: ['P4', 'l', 0.59],
    label: 'ลิงก์ สถานะ วันเริ่ม/หมดอายุ',
    seg: 2,
    lt: 0.5,
  },
  {
    from: ['D5', 'r', 0.3],
    via: [
      [1160, 484],
      [1160, 135],
    ],
    to: ['P4', 'l', 0.86],
    label: 'โดเมนที่บล็อก',
    seg: 2,
    lt: 0.55,
  },
  { from: ['P4', 'b', 0.5], to: ['P5', 't', 0.5], label: 'ข้อมูลการคลิก', lt: 0.5 },
  {
    from: ['P5', 'l', 0.3],
    via: [
      [1215, 357],
      [1215, 672],
    ],
    to: ['D4', 'r', 0.26],
    label: 'คลิก (IP แบบ hash, ประเทศ)',
    seg: 1,
    lt: 0.62,
  },
  { from: ['A', 'l', 0.3], to: ['P7', 'r', 0.3], label: 'คำสั่งผู้ดูแล', lt: 0.5 },
  { from: ['P7', 'r', 0.7], to: ['A', 'l', 0.8], label: 'ภาพรวม รายการ', lt: 0.5 },
  { from: ['D4', 'r', 0.74], to: ['P7', 'l', 0.46], label: 'ยอดคลิกรวม', lt: 0.5 },
  {
    from: ['P7', 'l', 0.2],
    via: [
      [1255, 652],
      [1255, 502],
    ],
    to: ['D5', 'r', 0.7],
    label: 'อ่าน / เขียน',
    both: true,
    seg: 2,
    lt: 0.35,
  },
  {
    from: ['P7', 'l', 0.08],
    via: [
      [1270, 639],
      [1270, 337],
    ],
    to: ['D3', 'r', 0.8],
    label: 'ระงับลิงก์',
    seg: 2,
    lt: 0.28,
  },
  {
    from: ['P7', 'b', 0.2],
    via: [
      [1342, 790],
      [1250, 790],
    ],
    to: ['D1b', 't', 0.5],
    label: 'ระงับ / เปิดบัญชี',
    seg: 1,
    lt: 0.3,
  },
  { from: ['P7', 'b', 0.7], to: ['D2b', 't', 0.5], label: 'ตัด session', lt: 0.5 },
];

const n = (v) => Math.round(v * 10) / 10;

function drawEntity(e) {
  const cy = e.y + e.h / 2;
  const text = e.lines
    .map(
      (t, i) =>
        `<text x="${e.x + e.w / 2}" y="${cy + (i - (e.lines.length - 1) / 2) * 24 + 7}" text-anchor="middle" font-size="19" font-weight="${i === 0 ? 700 : 400}" fill="${NAVY}">${t}</text>`,
    )
    .join('');
  return `<rect x="${e.x + 6}" y="${e.y + 6}" width="${e.w}" height="${e.h}" fill="${NAVY}"/><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="#fff" stroke="${NAVY}" stroke-width="2"/>${text}`;
}

function drawProcess(p) {
  const band = 30;
  const bodyCy = p.y + band + (p.h - band) / 2;
  const text = p.lines
    .map(
      (t, i) =>
        `<text x="${p.x + p.w / 2}" y="${bodyCy + (i - (p.lines.length - 1) / 2) * 23 + 7}" text-anchor="middle" font-size="18" fill="${NAVY}">${t}</text>`,
    )
    .join('');
  return (
    `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="14" fill="#fff" stroke="${NAVY}" stroke-width="2"/>` +
    `<path d="M${p.x} ${p.y + band} V${p.y + 14} Q${p.x} ${p.y} ${p.x + 14} ${p.y} H${p.x + p.w - 14} Q${p.x + p.w} ${p.y} ${p.x + p.w} ${p.y + 14} V${p.y + band} Z" fill="${NAVY}"/>` +
    `<text x="${p.x + p.w / 2}" y="${p.y + 21}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">${p.id}</text>` +
    text
  );
}

function drawStore(s) {
  const idw = 46;
  return (
    `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${STORE_BG}"/>` +
    `<path d="M${s.x + s.w} ${s.y} H${s.x} V${s.y + s.h} H${s.x + s.w}" fill="none" stroke="${NAVY}" stroke-width="2"/>` +
    `<line x1="${s.x + idw}" y1="${s.y}" x2="${s.x + idw}" y2="${s.y + s.h}" stroke="${NAVY}" stroke-width="2"/>` +
    (s.dup
      ? `<line x1="${s.x + 10}" y1="${s.y}" x2="${s.x + 10}" y2="${s.y + s.h}" stroke="${NAVY}" stroke-width="2"/>`
      : '') +
    `<text x="${s.x + idw / 2 + (s.dup ? 5 : 0)}" y="${s.y + s.h / 2 + 6}" text-anchor="middle" font-size="16" font-weight="700" fill="${RED}">${s.id}</text>` +
    `<text x="${s.x + idw + 14}" y="${s.y + s.h / 2 + 6}" font-size="17" fill="${NAVY}" font-family="Consolas,monospace">${s.name}</text>`
  );
}

function drawFlow(f) {
  const pts = [anchor(...f.from), ...(f.via ?? []), anchor(...f.to)];
  const seg = f.seg ?? 0;
  const [ax, ay] = pts[seg];
  const [bx, by] = pts[seg + 1];
  const t = f.lt ?? 0.5;
  const lx = ax + (bx - ax) * t;
  const ly = ay + (by - ay) * t;
  const tw = [...f.label].length * 7.4 + 12;
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ');
  return (
    `<path d="${d}" fill="none" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round" marker-end="url(#arrow)"${f.both ? ' marker-start="url(#arrow-start)"' : ''}/>` +
    `<rect x="${n(lx - tw / 2)}" y="${n(ly - 11)}" width="${n(tw)}" height="21" rx="4" fill="#fff" fill-opacity="0.95"/>` +
    `<text x="${n(lx)}" y="${n(ly + 5)}" text-anchor="middle" font-size="14" fill="#2b3350">${f.label}</text>`
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
<title>DFD Level 0 - Synerry Short URL</title>
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${LINE}"/></marker>
  <marker id="arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M10 0 L0 5 L10 10 z" fill="${LINE}"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="#fff"/>
${flows.map(drawFlow).join('\n')}
${Object.values(entities).map(drawEntity).join('\n')}
${Object.values(processes).map(drawProcess).join('\n')}
${Object.values(stores).map(drawStore).join('\n')}
</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log('wrote', OUT);
