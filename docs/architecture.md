# Architecture

ระบบแบ่งเป็น 3 microservice ที่ deploy แยกกัน และหน้าเว็บ React ที่ gateway เป็นผู้เสิร์ฟ แต่ละ service เป็นเจ้าของข้อมูลของตัวเอง และคุยกันผ่าน HTTP ภายในที่ต้องแนบ key ลับ (`X-Internal-Key`)

```mermaid
flowchart LR
  subgraph Clients["ผู้ใช้"]
    B["Browser<br/>ผู้ใช้งาน / ผู้ดูแลระบบ"]
    V["ผู้เปิดลิงก์สั้น<br/>คลิกลิงก์ / สแกน QR"]
  end

  subgraph Render["Render (Node.js 22)"]
    GW["<b>gateway</b><br/>Hono<br/>หน้าเว็บ React + REST API<br/>บัญชี session ลิงก์ ผู้ดูแล<br/>ส่งออก CSV/Excel"]
    RD["<b>redirect</b><br/>Hono<br/>GET /:code<br/>ไม่มีฐานข้อมูลของตัวเอง"]
    AN["<b>analytics</b><br/>Hono<br/>บันทึกคลิก คำนวณสถิติ<br/>GeoIP, แยก bot"]
  end

  subgraph Neon["Neon (PostgreSQL 16)"]
    GDB[("<b>gateway_db</b><br/>users<br/>sessions<br/>links<br/>blocked_domains")]
    ADB[("<b>analytics_db</b><br/>clicks")]
  end

  B -- "HTTPS<br/>หน้าเว็บ + /api (cookie session)" --> GW
  V -- "HTTPS<br/>/:code" --> RD

  RD -- "ค้นลิงก์<br/>GET /internal/links/:code" --> GW
  RD -- "บันทึกคลิก<br/>POST /internal/clicks<br/>(รอไม่เกิน 1.5 วินาที)" --> AN
  GW -- "ขอยอดคลิกและสถิติ<br/>ลบคลิกเมื่อลบลิงก์ถาวร" --> AN

  GW -- "อ่าน/เขียน<br/>(เฉพาะ gateway_user)" --> GDB
  AN -- "อ่าน/เขียน<br/>(เฉพาะ analytics_user)" --> ADB
```

## ความรับผิดชอบของแต่ละ service

| service | หน้าที่ | ข้อมูลที่เป็นเจ้าของ | เปิดให้ภายนอก |
|---|---|---|---|
| **gateway** | เสิร์ฟหน้าเว็บ, สมัคร/เข้าสู่ระบบ (session), สร้างและจัดการลิงก์, ถังขยะ, หน้าผู้ดูแล, ส่งออก CSV/Excel, ตรวจ blocklist, ตรวจสิทธิ์ความเป็นเจ้าของก่อนขอสถิติ | `users`, `sessions`, `links`, `blocked_domains` | หน้าเว็บ และ `/api/*` |
| **redirect** | รับการเปิดลิงก์สั้น ตรวจสถานะ แล้วพาไปปลายทาง หรือแสดงหน้าแจ้งเหตุผล | ไม่มี (stateless) | `/:code` |
| **analytics** | บันทึกคลิก (อุปกรณ์ browser OS ประเทศ แยก bot hash IP) และคำนวณสถิติ | `clicks` | ไม่มี (ภายในเท่านั้น) |

## เมื่อมีคนเปิดลิงก์สั้น

```mermaid
sequenceDiagram
  autonumber
  participant V as ผู้เปิดลิงก์
  participant R as redirect
  participant G as gateway
  participant A as analytics

  V->>R: GET /synerry
  R->>G: GET /internal/links/synerry (X-Internal-Key, รอไม่เกิน 3 วินาที)
  alt กรณีลิงก์ใช้ไม่ได้
    G-->>R: ข้อมูลลิงก์ หรือ 404
    Note over R: ไม่พบ, ถูกปิด, ถูกระงับ, หมดอายุ,<br/>ยังไม่ถึงวันเริ่ม หรือโดเมนถูกบล็อก
    R-->>V: หน้าแจ้งเหตุผล (404 / 410 / 403)
  else กรณี gateway ไม่ตอบ
    R-->>V: 503 หน้าให้ลองใหม่ (ไม่ใช่ 404 เพราะลิงก์อาจมีอยู่จริง)
  else กรณีลิงก์ใช้งานได้
    G-->>R: id, URL ต้นฉบับ, สถานะ
    R->>A: POST /internal/clicks (รอไม่เกิน 1.5 วินาที)
    Note over R,A: บันทึกก่อนตอบ คลิกไม่หายตอน Render หลับ<br/>ถ้า analytics ล่มหรือช้า ข้ามไปพาไปปลายทางเลย
    A-->>R: 201 บันทึกแล้ว
    R-->>V: 302 ไปยัง URL ต้นฉบับ (Cache-Control: no-store)
  end
```

## การตัดสินใจสำคัญ

- **redirect แยกจาก gateway:** ทางเปิดลิงก์เป็นส่วนที่มีคนใช้มากที่สุด แยกออกมาเพื่อขยายได้อิสระ และไม่มีฐานข้อมูลของตัวเอง
- **รอบันทึกคลิกก่อนตอบ แต่มีเวลาจำกัด:** Render free tier หยุด process ได้หลังตอบ ถ้ายิงแล้วลืม คลิกจะหาย การรอไม่เกิน 1.5 วินาทีทำให้คลิกไม่หาย และ analytics ล่มก็ไม่ทำให้ลิงก์ใช้ไม่ได้
- **302 ไม่ใช่ 301:** browser จำ 301 ไว้ถาวร คลิกครั้งต่อไปจะไม่ผ่านเรา นับไม่ได้ และปิดลิงก์แล้วไม่มีผล
- **หน้าเว็บอยู่โดเมนเดียวกับ API:** cookie session ทำงานได้โดยไม่ต้องใช้ third-party cookie และไม่ต้องเปิด CORS
- **frontend ไม่เรียก analytics ตรง:** gateway ตรวจความเป็นเจ้าของก่อนเสมอ analytics จึงไม่ต้องรู้เรื่องผู้ใช้
- **analytics ล่ม ระบบหลักยังใช้ได้:** หน้าประวัติแสดงยอดคลิกเป็น "-" แทน 0 ที่ผิด และมีแถบแจ้งเตือน
