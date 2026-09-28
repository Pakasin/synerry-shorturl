// นำเข้า Hono สำหรับสร้างกลุ่ม route
import { Hono, type Context } from 'hono';
// นำเข้าตัวช่วยอ่าน ตั้ง และลบ cookie
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
// นำเข้า bcryptjs สำหรับ hash และตรวจรหัสผ่าน
import bcrypt from 'bcryptjs';
// นำเข้าตัวสร้างเงื่อนไข query
import { eq } from 'drizzle-orm';
// นำเข้า zod สำหรับตรวจข้อมูลที่ผู้ใช้ส่งมา
import { z } from 'zod';
// นำเข้า connection ฐานข้อมูล
import { db } from '../db/client';
// นำเข้านิยามตาราง users
import { users } from '../db/schema';
// นำเข้าฟังก์ชันจัดการ session
import { createSession, deleteExpiredSessions, deleteSession } from '../auth/session';
// นำเข้าค่าตั้งค่า
import { config } from '../config';
// นำเข้า middleware ต่างๆ
import { requireAuth } from '../middleware/requireAuth';
import { rateLimit } from '../middleware/rateLimit';
// นำเข้าชนิดข้อมูลและตัวช่วยสร้าง error
import { apiError, type AppEnv } from '../types';

// กฎของข้อมูลที่ใช้ทั้งตอนสมัครและตอน login
const credentialsSchema = z.object({
  // ชื่อผู้ใช้: ตัดช่องว่าง แปลงเป็นตัวเล็ก ยาว 3-30 ตัว ใช้ได้เฉพาะ a-z 0-9 และ _
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Username may contain only letters, numbers and _'),
  // รหัสผ่าน: อย่างน้อย 8 ตัว และไม่เกิน 72 ตัวเพราะ bcrypt ใช้ได้แค่ 72 byte แรก
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

// hash หลอกที่คำนวณไว้ล่วงหน้า ใช้ตรวจเทียบเมื่อไม่พบผู้ใช้ เพื่อให้เวลาตอบเท่ากัน
// ป้องกันการเดาว่าชื่อผู้ใช้ไหนมีอยู่จริงจากความเร็วในการตอบ
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

// ตั้ง cookie session ด้วยค่าที่ปลอดภัย
function setSessionCookie(c: Context, token: string, expiresAt: Date) {
  setCookie(c, config.sessionCookieName, token, {
    // JavaScript ในหน้าเว็บอ่าน cookie นี้ไม่ได้ กันการขโมยผ่าน XSS
    httpOnly: true,
    // บน production ส่ง cookie ผ่าน HTTPS เท่านั้น
    secure: config.isProduction,
    // ไม่ส่ง cookie ไปกับ request ที่มาจากเว็บอื่น (ยกเว้นการคลิกลิงก์ธรรมดา)
    sameSite: 'Lax',
    // ใช้ได้ทุก path ของเว็บ
    path: '/',
    // หมดอายุพร้อมกับ session ในฐานข้อมูล
    expires: expiresAt,
  });
}

// สร้างกลุ่ม route ของระบบสมาชิก
export function authRoutes() {
  // สร้าง router ย่อย
  const r = new Hono<AppEnv>();
  // จำกัดการสมัครและ login ไว้ที่ 10 ครั้งต่อ 15 นาทีต่อ IP กันการเดารหัสผ่าน
  const limiter = rateLimit({ max: 10, windowMs: 15 * 60 * 1000 });

  // สมัครสมาชิก แล้ว login ให้ทันที
  r.post('/register', limiter, async (c) => {
    // อ่าน body แบบ JSON ถ้าอ่านไม่ได้ให้เป็น object ว่าง
    const body = await c.req.json().catch(() => ({}));
    // ตรวจข้อมูลตามกฎ
    const parsed = credentialsSchema.safeParse(body);
    // ถ้าไม่ผ่าน ตอบ 400 พร้อมรายการปัญหา
    if (!parsed.success) {
      return c.json(apiError('validation_error', 'Invalid input', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))), 400);
    }
    // แยกชื่อผู้ใช้และรหัสผ่านที่ผ่านการตรวจแล้ว
    const { username, password } = parsed.data;
    // hash รหัสผ่านก่อนเก็บ
    const passwordHash = await bcrypt.hash(password, 10);
    // เพิ่มผู้ใช้ ถ้าชื่อซ้ำจะไม่เพิ่มและได้ผลลัพธ์ว่าง
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash })
      .onConflictDoNothing({ target: users.username })
      .returning({ id: users.id, username: users.username, role: users.role, onboardedAt: users.onboardedAt, createdAt: users.createdAt });
    // ถ้าได้ผลลัพธ์ว่าง แปลว่าชื่อนี้มีคนใช้แล้ว ตอบ 409
    if (!user) return c.json(apiError('username_taken', 'This username is already taken'), 409);
    // สร้าง session ให้ผู้ใช้ใหม่
    const { token, expiresAt } = await createSession(user.id);
    // ตั้ง cookie
    setSessionCookie(c, token, expiresAt);
    // ตอบ 201 พร้อมข้อมูลผู้ใช้
    return c.json({ user }, 201);
  });

  // เข้าสู่ระบบ
  r.post('/login', limiter, async (c) => {
    // อ่าน body แบบ JSON
    const body = await c.req.json().catch(() => ({}));
    // ตรวจข้อมูลตามกฎ
    const parsed = credentialsSchema.safeParse(body);
    // ข้อความ error เดียวกันทุกกรณี ไม่บอกว่าผิดที่ชื่อหรือรหัสผ่าน
    const invalid = () => c.json(apiError('invalid_credentials', 'Invalid username or password'), 401);
    // ถ้ารูปแบบไม่ถูกต้อง ก็ถือว่า login ไม่ผ่าน
    if (!parsed.success) return invalid();
    // แยกชื่อผู้ใช้และรหัสผ่าน
    const { username, password } = parsed.data;
    // ค้นหาผู้ใช้จากชื่อ
    const [user] = await db.select().from(users).where(eq(users.username, username));
    // ตรวจรหัสผ่านเสมอ ถ้าไม่มีผู้ใช้ให้เทียบกับ hash หลอก เพื่อให้เวลาตอบเท่ากัน
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    // ถ้าไม่มีผู้ใช้หรือรหัสผิด ตอบ 401
    if (!user || !ok) return invalid();
    // รหัสถูกแต่บัญชีถูกระงับ ตอบ 403 พร้อมเหตุผล (บอกได้เพราะผู้ใช้พิสูจน์แล้วว่าเป็นเจ้าของบัญชี)
    if (!user.isActive) return c.json(apiError('account_suspended', 'This account has been suspended'), 403);
    // ถ้าเคยมี cookie เก่า ลบ session เดิมทิ้ง กัน session fixation
    const oldToken = getCookie(c, config.sessionCookieName);
    if (oldToken) await deleteSession(oldToken);
    // เก็บกวาด session ที่หมดอายุไปพร้อมกัน
    await deleteExpiredSessions();
    // สร้าง session ใหม่เสมอหลัง login สำเร็จ
    const { token, expiresAt } = await createSession(user.id);
    // ตั้ง cookie
    setSessionCookie(c, token, expiresAt);
    // ตอบข้อมูลผู้ใช้ โดยไม่ส่ง password_hash ออกไป
    return c.json({ user: { id: user.id, username: user.username, role: user.role, onboardedAt: user.onboardedAt, createdAt: user.createdAt } });
  });

  // ออกจากระบบ
  r.post('/logout', async (c) => {
    // อ่าน token จาก cookie
    const token = getCookie(c, config.sessionCookieName);
    // ถ้ามี ให้ลบ session ในฐานข้อมูล ทำให้ token นี้ใช้ไม่ได้ทันที
    if (token) await deleteSession(token);
    // ลบ cookie ใน browser
    deleteCookie(c, config.sessionCookieName, { path: '/' });
    // ตอบ 204 ไม่มีเนื้อหา
    return c.body(null, 204);
  });

  // บันทึกว่าผู้ใช้ดูคู่มือแนะนำจบแล้ว (หรือกดข้าม) จะได้ไม่แสดงอีกในทุกเครื่องที่ใช้บัญชีนี้
  r.post('/onboarding', requireAuth, async (c) => {
    // ผู้ใช้ปัจจุบัน
    const user = c.get('user');
    // บันทึกเวลาครั้งแรกเท่านั้น ถ้าเคยบันทึกแล้วคงค่าเดิม (เรียกซ้ำได้โดยไม่มีผลเสีย)
    const [updated] = await db
      .update(users)
      .set({ onboardedAt: user.onboardedAt ?? new Date() })
      .where(eq(users.id, user.id))
      .returning({ id: users.id, username: users.username, role: users.role, onboardedAt: users.onboardedAt, createdAt: users.createdAt });
    // ตอบข้อมูลผู้ใช้ล่าสุด
    return c.json({ user: updated });
  });

  // ดูข้อมูลผู้ใช้ที่ login อยู่ frontend ใช้ตรวจว่ายัง login อยู่ไหม
  r.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }));

  // คืน router ที่ตั้งค่าเสร็จแล้ว
  return r;
}
