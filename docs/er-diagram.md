# ER Diagram

ระบบใช้ PostgreSQL สองฐานข้อมูล ตามหลัก database-per-service แต่ละ service เป็นเจ้าของข้อมูลของตัวเอง และมีสิทธิ์เชื่อมต่อเฉพาะฐานข้อมูลของตัวเอง

| ฐานข้อมูล | เจ้าของ | ตาราง |
|---|---|---|
| `gateway_db` | gateway service | `users`, `sessions`, `links`, `blocked_domains` |
| `analytics_db` | analytics service | `clicks` |

```mermaid
erDiagram
  USERS ||--o{ SESSIONS : "มี session"
  USERS ||--o{ LINKS : "เป็นเจ้าของ"
  USERS |o--o{ LINKS : "ระงับลิงก์ (locked_by)"
  USERS |o--o{ BLOCKED_DOMAINS : "เพิ่มโดเมน (created_by)"
  LINKS ||..o{ CLICKS : "ถูกคลิก (อ้างอิงข้ามฐานข้อมูล)"

  USERS {
    serial id PK
    varchar username UK "ตัวเล็กทั้งหมด 3-30 ตัว"
    text password_hash "bcrypt"
    varchar role "user หรือ admin"
    boolean is_active "false = ถูกระงับ"
    timestamptz onboarded_at "null = ยังไม่ได้ดูคู่มือ"
    timestamptz created_at
  }

  SESSIONS {
    varchar id PK "sha256 ของ token ใน cookie"
    integer user_id FK
    timestamptz expires_at
    timestamptz created_at
  }

  LINKS {
    serial id PK
    integer user_id FK "เจ้าของ"
    text original_url "http/https รูปแบบมาตรฐาน"
    varchar short_code UK "รหัสสุ่ม 6 ตัว หรือ alias"
    varchar title
    text_array tags "สูงสุด 10 แท็ก"
    boolean is_active "เจ้าของเปิด/ปิด"
    timestamptz starts_at "null = ใช้ได้ทันที"
    timestamptz expires_at "null = ไม่หมดอายุ"
    timestamptz deleted_at "null = ไม่อยู่ในถังขยะ"
    timestamptz locked_at "null = ไม่ถูกระงับ"
    varchar lock_reason
    integer locked_by FK "ผู้ดูแลที่ระงับ"
    timestamptz created_at
    timestamptz updated_at
  }

  BLOCKED_DOMAINS {
    serial id PK
    varchar domain UK
    varchar reason
    integer created_by FK "ผู้ดูแลที่เพิ่ม"
    timestamptz created_at
  }

  CLICKS {
    bigserial id PK
    integer link_id "อ้างอิง links.id แบบ logical"
    timestamptz clicked_at
    varchar ip_hash "sha256 + salt ไม่เก็บ IP จริง"
    text user_agent
    text referer
    varchar device_type "desktop mobile tablet other bot"
    varchar browser
    varchar os
    varchar country "ISO 2 ตัว เช่น TH"
  }
```

## ความสัมพันธ์

| ความสัมพันธ์ | ชนิด | เมื่อลบฝั่งหลัก |
|---|---|---|
| users 1 : N sessions | foreign key | ลบ session ตาม (cascade) |
| users 1 : N links (เจ้าของ) | foreign key | ลบลิงก์ตาม (cascade) |
| users 0..1 : N links (ผู้ดูแลที่ระงับ) | foreign key | ตั้งเป็น null การระงับยังอยู่ |
| users 0..1 : N blocked_domains (ผู้เพิ่ม) | foreign key | ตั้งเป็น null รายการยังอยู่ |
| links 1 : N clicks | **logical (เส้นประ)** ไม่มี foreign key เพราะอยู่คนละฐานข้อมูล | gateway สั่ง analytics ให้ลบคลิกผ่าน API ตอนลบลิงก์ถาวร |

## index ที่สร้างไว้

| ตาราง | index | ใช้กับ |
|---|---|---|
| links | `(user_id, created_at)` | หน้าประวัติ เรียงลิงก์ของผู้ใช้จากใหม่ไปเก่า |
| links | GIN บน `tags` | กรองประวัติตามแท็ก |
| links | unique บน `short_code` | redirect ค้นลิงก์จากรหัส และกันรหัสซ้ำ |
| sessions | `user_id` | ลบ session ทั้งหมดของผู้ใช้ตอนระงับบัญชี |
| clicks | `(link_id, clicked_at)` | สถิติของลิงก์หนึ่งตามช่วงเวลา |

## เหตุผลของการออกแบบที่สำคัญ

- **แยกฐานข้อมูลตาม service:** analytics ล่มหรือถูกเขียนหนักๆ ก็ไม่กระทบการสร้างลิงก์ และแต่ละ service ขยายหรือย้ายฐานข้อมูลได้อิสระ ข้อเสียคือไม่มี foreign key ข้ามฐานข้อมูล จึงต้องให้ gateway รับผิดชอบลบคลิกเมื่อลบลิงก์
- **session เก็บแค่ hash ของ token:** ถ้าฐานข้อมูลหลุด ก็เอาค่าไปสวมเป็น session ไม่ได้
- **clicks เก็บ ip_hash ไม่เก็บ IP จริง:** ยังนับผู้เข้าชมไม่ซ้ำได้ แต่ไม่เก็บข้อมูลส่วนบุคคล ประเทศหาจาก IP ก่อน hash
- **ลบแบบกู้คืนได้ (deleted_at):** ลิงก์อยู่ในถังขยะ 30 วัน และรหัสสั้นยังถูกจองไว้ กันคนอื่นยึดรหัสเดิมไปชี้เว็บหลอกลวง
- **locked_at แยกจาก is_active:** ผู้ดูแลระงับได้โดยเจ้าของเปิดเองไม่ได้ และเจ้าของยังเห็นเหตุผล
