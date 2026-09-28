# Synerry Short URL

ระบบย่อลิงก์ สร้าง QR Code และเก็บสถิติการคลิก พัฒนาเป็นแบบทดสอบ Developer ของ Synerry
แบ่งเป็น 3 microservice บน Node.js ใช้ PostgreSQL แยกฐานข้อมูลตาม service และมีหน้าเว็บ React รองรับภาษาไทย/อังกฤษและโหมดมืด

![Architecture](docs/images/architecture.png)

## สารบัญ

- [ลองใช้งานออนไลน์](#ลองใช้งานออนไลน์)
- [ตรงกับเกณฑ์การพิจารณา](#ตรงกับเกณฑ์การพิจารณา)
- [ฟีเจอร์](#ฟีเจอร์)
- [สถาปัตยกรรมและเอกสารออกแบบ](#สถาปัตยกรรมและเอกสารออกแบบ)
- [เทคโนโลยีที่ใช้](#เทคโนโลยีที่ใช้)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [ติดตั้งและรันบนเครื่อง](#ติดตั้งและรันบนเครื่อง)
- [ตัวแปร environment](#ตัวแปร-environment)
- [การทดสอบ](#การทดสอบ)
- [API](#api)
- [ความปลอดภัย](#ความปลอดภัย)
- [Deploy](#deploy)
- [เครดิตและสัญญาอนุญาต](#เครดิตและสัญญาอนุญาต)

## ลองใช้งานออนไลน์

| | URL |
|---|---|
| หน้าเว็บ | _จะเพิ่มหลัง deploy_ |
| ลิงก์สั้น (redirect) | _จะเพิ่มหลัง deploy_ |

| บัญชีทดลอง | ชื่อผู้ใช้ | รหัสผ่าน |
|---|---|---|
| ผู้ใช้ทั่วไป | `demo` | `Demo@1234` |
| ผู้ดูแลระบบ | `admin` | `Admin@1234` |

> ใช้ Render แบบฟรี service จะหลับเมื่อไม่มีคนใช้ 15 นาที การเปิดครั้งแรกอาจช้า 30-60 วินาที
> รัน `npm run warmup` ก่อนสาธิตเพื่อปลุกทุก service

## ตรงกับเกณฑ์การพิจารณา

| เกณฑ์ | ส่วนที่ทำ | ดูที่ |
|---|---|---|
| 1. DFD Level 0 | Context Diagram และ DFD Level 0 ครบ 7 กระบวนการ 5 แหล่งข้อมูล | [docs/dfd.md](docs/dfd.md) |
| 2. ER Diagram | 5 ตารางใน 2 ฐานข้อมูล พร้อมความสัมพันธ์ index และเหตุผลการออกแบบ | [docs/er-diagram.md](docs/er-diagram.md) |
| 3. สร้าง Short URL | กรอก URL ได้ลิงก์สั้นทันที กดแล้วไปยัง URL ต้นแบบจริง (302) | หน้าภาพรวม |
| 4. QR Code | QR ของลิงก์สั้น สแกนแล้วเปิดปลายทางจริง ดาวน์โหลดได้ทั้ง PNG และ SVG | ป้ายลิงก์ในหน้าภาพรวมและหน้ารายละเอียด |
| 5. ประวัติและสถิติ | รายการ URL ที่กรอกกับลิงก์สั้น ยอดคลิก กราฟรายวัน แผนที่ประเทศ อุปกรณ์ browser แหล่งที่มา | หน้าประวัติลิงก์และหน้ารายละเอียด |
| 6. ไอเดียเพิ่มเติม | ดูหัวข้อ [ฟีเจอร์เพิ่มเติม](#ฟีเจอร์เพิ่มเติม) | |
| Microservice + Architecture Diagram | 3 service แยก deploy และแยกฐานข้อมูล | [docs/architecture.md](docs/architecture.md) |

## ฟีเจอร์

### ฟีเจอร์หลัก

- ย่อลิงก์เป็นรหัสสุ่ม 6 ตัว หรือตั้งชื่อเอง (alias)
- QR Code ของลิงก์สั้น ดาวน์โหลด PNG และ SVG
- ประวัติลิงก์ ค้นหา กรองตามแท็ก แบ่งหน้า พร้อมยอดคลิก
- สถิติต่อลิงก์: กราฟรายวัน (7/30/90 วัน ตัดวันตามเวลาไทย) แผนที่ประเทศ อุปกรณ์ browser ระบบปฏิบัติการ แหล่งที่มา คลิกล่าสุด ผู้เข้าชมไม่ซ้ำ
- สมัครสมาชิก เข้าสู่ระบบด้วย session (cookie HttpOnly)

### ฟีเจอร์เพิ่มเติม

| ฟีเจอร์ | ประโยชน์ต่อผู้ใช้ |
|---|---|
| วันเริ่มใช้งานและวันหมดอายุ | ตั้งลิงก์ล่วงหน้าสำหรับแคมเปญ และให้ลิงก์หมดอายุเอง |
| เปิด/ปิดลิงก์ | หยุดลิงก์ชั่วคราวโดยไม่ต้องลบ |
| แท็ก | จัดกลุ่มลิงก์ตามแคมเปญหรือหน่วยงาน กรองในหน้าประวัติ |
| เตือน URL ซ้ำ | เคยย่อ URL นี้แล้ว เสนอให้ใช้ลิงก์เดิม ยอดคลิกจะรวมอยู่ที่เดียว |
| ถังขยะ | ลบผิดกู้คืนได้ภายใน 30 วัน รหัสลิงก์ยังถูกจองไว้ ไม่มีใครยึดไปใช้ได้ |
| Blocklist | ไม่ให้ย่อลิงก์ไปบริการย่อลิงก์อื่นหรือโดเมนอันตราย กันการใช้ซ่อนลิงก์หลอกลวง |
| ไม่นับ bot และ preview ของแอปแชต | ยอดคลิกไม่เกินจริงเวลาวางลิงก์ใน LINE หรือ Slack |
| ส่งออก CSV และ Excel | นำข้อมูลไปทำรายงานต่อ (กันสูตรอันตรายใน Excel) |
| พิมพ์รายงานสถิติเป็น PDF | หน้ารายละเอียดจัดรูปแบบสำหรับกระดาษ A4 พร้อม QR |
| หน้าผู้ดูแลระบบ | ภาพรวมทั้งระบบ ระงับบัญชี ระงับลิงก์พร้อมเหตุผล จัดการ blocklist |
| คู่มือแนะนำการใช้งาน | แสดงทีละขั้นเมื่อเข้าใช้ครั้งแรก เปิดดูอีกครั้งได้จากปุ่ม ? |
| ภาษาไทย/อังกฤษ และโหมดมืด | เลือกได้ จำค่าไว้ในเครื่อง |
| ใช้งานบนมือถือได้ | ทุกหน้าปรับตามขนาดจอ |
| ระบบยังใช้ได้เมื่อ analytics ล่ม | ลิงก์สั้นยังพาไปปลายทางได้ หน้าประวัติยังเปิดได้ |

## สถาปัตยกรรมและเอกสารออกแบบ

| service | พอร์ตบนเครื่อง | หน้าที่ | ฐานข้อมูล |
|---|---|---|---|
| gateway | 3001 | หน้าเว็บ, REST API, บัญชี, ลิงก์, ผู้ดูแล, ส่งออกไฟล์ | `gateway_db`: users, sessions, links, blocked_domains |
| redirect | 3002 | เปิดลิงก์สั้นแล้วพาไปปลายทาง | ไม่มี |
| analytics | 3003 | บันทึกคลิก คำนวณสถิติ | `analytics_db`: clicks |
| frontend (dev) | 5173 | Vite dev server (ตอน production gateway เสิร์ฟไฟล์ที่ build แล้ว) | - |

เอกสาร

- [docs/architecture.md](docs/architecture.md) แผนภาพสถาปัตยกรรม ลำดับการทำงานตอนเปิดลิงก์สั้น และเหตุผลการตัดสินใจ
- [docs/dfd.md](docs/dfd.md) Context Diagram และ DFD Level 0
- [docs/er-diagram.md](docs/er-diagram.md) ER Diagram ความสัมพันธ์ และ index
- รูป PNG สำหรับนำเสนอทั้งหมดอยู่ใน [docs/images](docs/images)

## เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
|---|---|
| Runtime | Node.js 22, TypeScript, npm workspaces |
| Backend | Hono + @hono/node-server, Drizzle ORM + postgres.js, zod, bcryptjs, nanoid |
| Analytics | ua-parser-js v1 (MIT), fast-geoip (GeoLite2) |
| ส่งออก | exceljs |
| Frontend | React 19, Vite, Tailwind CSS v4, React Router, recharts, d3-geo, qrcode.react, sonner |
| ฐานข้อมูล | PostgreSQL 16 (Docker บนเครื่อง, Neon บน production) |
| ทดสอบ | Vitest ทดสอบกับฐานข้อมูลจริง |
| Hosting | Render (3 web service) + Neon |

## โครงสร้างโปรเจกต์

```
synerry-shorturl/
  services/
    gateway/          REST API, session, ลิงก์, ผู้ดูแล, เสิร์ฟหน้าเว็บ (+ drizzle/ migration)
    redirect/         GET /:code
    analytics/        บันทึกคลิกและสถิติ (+ drizzle/ migration)
  packages/shared/    logger, รูปแบบ /health, middleware ตรวจ key ภายใน
  frontend/           หน้าเว็บ React
  docs/               DFD, ER, architecture และรูปประกอบ
  scripts/            seed คลิกตัวอย่าง, warm-up
  docker/postgres/    สคริปต์สร้างฐานข้อมูลและ user ตอนเริ่ม container
  docker-compose.yml  PostgreSQL สำหรับรันบนเครื่อง
```

## ติดตั้งและรันบนเครื่อง

### สิ่งที่ต้องมี

- Node.js 22 ขึ้นไป
- Docker Desktop (เปิดไว้ก่อนเริ่ม)
- Git

### ขั้นตอน

1. โคลนโปรเจกต์และติดตั้ง dependency

   ```bash
   git clone <repository-url>
   cd synerry-shorturl
   npm install
   ```

2. เปิด PostgreSQL (พอร์ต 5434) สคริปต์เริ่มต้นจะสร้างฐานข้อมูล `gateway_db`, `analytics_db`, ฐานข้อมูลสำหรับ test และ user แยกตาม service ให้อัตโนมัติ

   ```bash
   npm run db:up
   ```

3. สร้างไฟล์ `.env` ของแต่ละ service จากตัวอย่าง (ค่าในตัวอย่างใช้กับ docker-compose ได้ทันที)

   ```bash
   # macOS / Linux / Git Bash
   cp services/gateway/.env.example services/gateway/.env
   cp services/redirect/.env.example services/redirect/.env
   cp services/analytics/.env.example services/analytics/.env
   ```

   ```powershell
   # Windows PowerShell
   Copy-Item services/gateway/.env.example services/gateway/.env
   Copy-Item services/redirect/.env.example services/redirect/.env
   Copy-Item services/analytics/.env.example services/analytics/.env
   ```

4. สร้างตาราง และใส่ข้อมูลตัวอย่าง (บัญชี `demo`, `admin` และลิงก์ตัวอย่าง)

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. เปิดทุก service และหน้าเว็บ

   ```bash
   npm run dev
   ```

   เปิด http://localhost:5173 แล้วเข้าสู่ระบบด้วย `demo` / `Demo@1234`

6. (ไม่บังคับ) ใส่คลิกตัวอย่างให้กราฟมีข้อมูล ต้องเปิด `npm run dev` ไว้ก่อน สคริปต์ส่งข้อมูลผ่าน API ของ analytics ไม่ได้เขียนฐานข้อมูลตรง

   ```bash
   npm run seed:clicks
   ```

### คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | เปิด gateway, redirect, analytics และหน้าเว็บพร้อมกัน |
| `npm test` | รัน test ทุก service |
| `npm run typecheck` | ตรวจชนิดข้อมูลทุก package |
| `npm run db:up` / `npm run db:down` | เปิด/ปิด PostgreSQL |
| `npm run db:generate` | สร้างไฟล์ migration หลังแก้ `schema.ts` |
| `npm run db:migrate` | รัน migration ทั้งสองฐานข้อมูล |
| `npm run db:seed` | รีเซ็ตบัญชีทดลองและลิงก์ตัวอย่าง (บัญชีทดลองจะเห็นคู่มือแนะนำอีกครั้ง) |
| `npm run seed:clicks` | ใส่คลิกตัวอย่าง (`-- --reset` ลบของเดิมก่อน) |
| `npm run build:web` | build หน้าเว็บ ให้ gateway เสิร์ฟที่พอร์ต 3001 ได้ |

> แก้ไฟล์ `.env` แล้วต้องหยุดและรัน `npm run dev` ใหม่ service ถึงจะอ่านค่าใหม่

## ตัวแปร environment

### gateway

| ตัวแปร | ตัวอย่าง | ความหมาย |
|---|---|---|
| `PORT` | `3001` | พอร์ต |
| `DATABASE_URL` | `postgres://gateway_user:...@localhost:5434/gateway_db` | ฐานข้อมูลของ gateway |
| `APP_ORIGINS` | `http://localhost:5173,http://localhost:3001` | origin ที่อนุญาตให้ส่ง POST/PATCH/DELETE (กัน CSRF) |
| `SESSION_TTL_DAYS` | `7` | อายุ session |
| `SHORT_BASE_URL` | `http://localhost:3002` | URL สาธารณะของ redirect ใช้ประกอบลิงก์สั้น |
| `INTERNAL_API_KEY` | ค่าสุ่มยาว | key ที่ service ใช้เรียกกัน ต้องตรงกันทุก service |
| `ANALYTICS_URL` | `http://localhost:3003` | URL ภายในของ analytics |
| `NODE_ENV` | `production` | บน production ทำให้ cookie เป็นแบบ Secure |
| `BLOCKED_DOMAINS` | `evil.com,scam.net` | (ไม่บังคับ) โดเมนที่บล็อกเพิ่มจากรายการในระบบ |
| `SEED_ADMIN_PASSWORD` | | (ไม่บังคับ) รหัสผ่านบัญชี `admin` ตอน seed |
| `FRONTEND_DIST` | `../../frontend/dist` | (ไม่บังคับ) โฟลเดอร์หน้าเว็บที่ build แล้ว |

### redirect

| ตัวแปร | ตัวอย่าง | ความหมาย |
|---|---|---|
| `PORT` | `3002` | พอร์ต |
| `GATEWAY_URL` | `http://localhost:3001` | URL ภายในของ gateway ใช้ค้นลิงก์ |
| `ANALYTICS_URL` | `http://localhost:3003` | URL ภายในของ analytics ใช้บันทึกคลิก |
| `APP_URL` | `http://localhost:5173` | หน้าเว็บหลัก (ปุ่มในหน้าแจ้งลิงก์ใช้ไม่ได้ และโลโก้) |
| `INTERNAL_API_KEY` | ค่าเดียวกับ gateway | |
| `LOOKUP_TIMEOUT_MS` | `3000` | รอค้นลิงก์สูงสุด |
| `CLICK_TIMEOUT_MS` | `1500` | รอบันทึกคลิกสูงสุด เกินแล้วพาไปปลายทางเลย |

### analytics

| ตัวแปร | ตัวอย่าง | ความหมาย |
|---|---|---|
| `PORT` | `3003` | พอร์ต |
| `DATABASE_URL` | `postgres://analytics_user:...@localhost:5434/analytics_db` | ฐานข้อมูลของ analytics |
| `INTERNAL_API_KEY` | ค่าเดียวกับ gateway | |
| `IP_HASH_SALT` | ค่าสุ่มยาว | salt ก่อน hash IP (ห้ามเปลี่ยนภายหลัง ไม่งั้นนับผู้เข้าชมไม่ซ้ำผิด) |
| `STATS_TIMEZONE` | `Asia/Bangkok` | เขตเวลาที่ใช้ตัดวันในกราฟ |

## การทดสอบ

```bash
npm test
```

ทดสอบกับฐานข้อมูล PostgreSQL จริง (`gateway_test`, `analytics_test` แยกจากข้อมูลตัวอย่าง) ไม่ใช้ mock ฐานข้อมูล ส่วนการเรียกข้าม service ใช้ fetch จำลอง เพื่อทดสอบกรณี service อื่นช้าหรือล่ม

| service | จำนวน | ครอบคลุม |
|---|---|---|
| gateway | 67 | สมัคร/เข้าสู่ระบบ, session (หมดอายุ, logout, session fixation, CSRF, rate limit), ลิงก์ (สร้าง, alias, ตรวจ URL, สิทธิ์เจ้าของ, ค้นหา, แท็ก, วันเริ่ม/หมดอายุ, URL ซ้ำ, ถังขยะ, blocklist), CSV/Excel (รวม CSV injection), ผู้ดูแลระบบ, คู่มือแนะนำ, การทำงานเมื่อ analytics ล่ม |
| analytics | 11 | บันทึกคลิก, แยกอุปกรณ์, hash IP, ประเทศจาก IP, แยก bot, สถิติรายวันตามเวลาไทย, ลบคลิก |
| redirect | 16 | 302 ไปปลายทาง, บันทึกคลิกก่อนตอบ, analytics ล่ม/ช้า, ลิงก์ไม่พบ/ปิด/หมดอายุ/ยังไม่เริ่ม/ถูกบล็อก, gateway ล่ม, HEAD ไม่นับคลิก |

## API

ทุก route ของ `/api` ต้องเข้าสู่ระบบ (cookie `sid`) ยกเว้นสมัครและเข้าสู่ระบบ error ตอบรูปแบบเดียวกัน `{ "error": { "code", "message", "details" } }`

### บัญชี

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/api/auth/register` | สมัคร `{ username, password }` แล้วเข้าสู่ระบบทันที |
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| POST | `/api/auth/logout` | ออกจากระบบ (ลบ session ที่ server) |
| GET | `/api/auth/me` | ผู้ใช้ปัจจุบัน |
| POST | `/api/auth/onboarding` | บันทึกว่าดูคู่มือแนะนำแล้ว |

### ลิงก์

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/api/links` | สร้าง `{ url, alias?, title?, tags?, startsAt?, expiresAt? }` |
| GET | `/api/links?q=&tag=&page=&pageSize=` | ประวัติ พร้อมยอดคลิก |
| GET | `/api/links/tags` | แท็กทั้งหมดพร้อมจำนวน |
| GET | `/api/links/duplicates?url=` | ลิงก์เดิมที่ชี้ URL เดียวกัน |
| GET | `/api/links/trash` | ถังขยะ |
| GET | `/api/links/export.csv` / `export.xlsx` | ส่งออก |
| GET / PATCH | `/api/links/:id` | ดู / แก้ไข (ชื่อ, แท็ก, เปิดปิด, วันเริ่ม, วันหมดอายุ) |
| DELETE | `/api/links/:id` | ย้ายไปถังขยะ |
| POST | `/api/links/:id/restore` | กู้คืน |
| DELETE | `/api/links/:id/permanent` | ลบถาวรพร้อมสถิติ |
| GET | `/api/links/:id/stats?days=7\|30\|90` | สถิติ |
| GET | `/api/stats/summary` | ภาพรวมของผู้ใช้ |

### ผู้ดูแลระบบ (ผู้ใช้ทั่วไปได้ 404)

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/api/admin/summary` | ภาพรวมทั้งระบบ |
| GET | `/api/admin/users?q=&page=` | รายชื่อผู้ใช้ |
| PATCH | `/api/admin/users/:id` | ระงับ/เปิดบัญชี `{ isActive }` |
| GET | `/api/admin/links?q=&filter=all\|locked` | ลิงก์ทั้งระบบ |
| POST | `/api/admin/links/:id/lock` / `unlock` | ระงับ `{ reason }` / ยกเลิก |
| GET / POST / DELETE | `/api/admin/blocklist[/:id]` | จัดการโดเมนที่บล็อก |

### ภายใน (ต้องแนบ `X-Internal-Key`)

| service | Method | Path | ผู้เรียก |
|---|---|---|---|
| gateway | GET | `/internal/links/:code` | redirect |
| analytics | POST | `/internal/clicks` | redirect |
| analytics | GET | `/internal/stats/:linkId?days=` | gateway |
| analytics | POST | `/internal/stats/summary` | gateway |
| analytics | DELETE | `/internal/clicks/:linkId` | gateway |

ทุก service มี `GET /health` ตอบ 200 เมื่อพร้อม และ 503 เมื่อฐานข้อมูลเชื่อมต่อไม่ได้

## ความปลอดภัย

- **รหัสผ่าน** hash ด้วย bcrypt ไม่เก็บรหัสจริง login ผิดตอบข้อความและเวลาเท่ากัน ไม่บอกว่าชื่อผู้ใช้มีอยู่หรือไม่
- **Session** token สุ่ม 256 bit เก็บใน cookie `HttpOnly; SameSite=Lax` (บน production `Secure`) ฐานข้อมูลเก็บแค่ sha256 ของ token สร้าง session ใหม่ทุกครั้งที่ login ออกจากระบบแล้วใช้ไม่ได้ทันที
- **CSRF** SameSite ร่วมกับตรวจ header `Origin` ของทุก request ที่แก้ไขข้อมูล
- **Rate limit** สมัคร/เข้าสู่ระบบ 10 ครั้งต่อ 15 นาที สร้างลิงก์ 30 ครั้งต่อนาที ต่อ IP
- **สิทธิ์** ทุก query ของลิงก์กรองด้วยเจ้าของ ลิงก์ของคนอื่นได้ 404 เหมือนไม่มีอยู่ route ผู้ดูแลตรวจบทบาทที่ server
- **URL ปลายทาง** รับเฉพาะ http/https ไม่รับ URL ที่มีชื่อผู้ใช้/รหัสผ่านซ่อนปลายทาง ไม่รับลิงก์สั้นของตัวเอง ตรวจ blocklist ทั้งตอนสร้างและตอน redirect
- **HTTP headers** Content-Security-Policy ไม่ให้รันสคริปต์ inline ห้ามฝังหน้าเว็บใน iframe
- **ข้อมูลส่วนบุคคล** ไม่เก็บ IP จริง เก็บเฉพาะ hash พร้อม salt
- **ฐานข้อมูล** แต่ละ service ใช้ user ของตัวเอง เชื่อมต่อฐานข้อมูลของ service อื่นไม่ได้ query ทั้งหมดส่งค่าเป็น parameter
- **ไฟล์ส่งออก** CSV ใส่ `'` หน้าค่าที่ขึ้นต้นด้วย `= + - @` กัน CSV injection
- **service ภายใน** ต้องแนบ key ตรวจแบบใช้เวลาคงที่ ไม่ได้ตั้ง key ไว้จะปฏิเสธทุกคำขอ

ข้อจำกัดที่รู้อยู่: rate limit เก็บในหน่วยความจำ (ใช้ได้กับ service ตัวเดียว ถ้าขยายหลายเครื่องต้องย้ายไป Redis) และการอ่าน IP จาก `x-forwarded-for` ต้องปรับตาม proxy ของผู้ให้บริการ hosting

## Deploy

ใช้ [Neon](https://neon.tech) สำหรับ PostgreSQL และ [Render](https://render.com) สำหรับ 3 service รายละเอียดขั้นตอนจะเพิ่มในหัวข้อนี้หลัง deploy จริง

สรุปลำดับ

1. Neon: สร้าง project และฐานข้อมูล `gateway_db`, `analytics_db`
2. Render: สร้าง web service 3 ตัวจาก repository นี้ (gateway, redirect, analytics) ตั้งค่าตัวแปร environment ตามตารางด้านบน
3. gateway: build หน้าเว็บด้วย `npm run build:web` แล้วรัน migration ก่อนเริ่ม service
4. ตั้ง `SHORT_BASE_URL` ของ gateway และ `APP_URL` ของ redirect เป็น URL จริงที่ Render ให้มา

## เครดิตและสัญญาอนุญาต

- This product includes GeoLite2 data created by MaxMind, available from [https://www.maxmind.com](https://www.maxmind.com) (CC BY-SA 4.0) ผ่าน package `fast-geoip`
- แผนที่โลกจาก `world-atlas` (Natural Earth, public domain)
- ฟอนต์ Anuphan โดย Cadson Demak (SIL Open Font License)
- โลโก้ Synerry เป็นของบริษัท Synerry Corporation (Thailand) ใช้เพื่อประกอบแบบทดสอบนี้เท่านั้น
