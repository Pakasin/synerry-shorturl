// นำเข้าฟังก์ชันของ React สำหรับสร้าง context และ state
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
// นำเข้าตัวพาไปหน้าอื่นและตัวอ่านตำแหน่งปัจจุบัน
import { Navigate, useLocation } from 'react-router';
// นำเข้าตัวเรียก API และชนิดข้อมูล
import { api, AUTH_EXPIRED_EVENT, type User } from './api';

// ข้อมูลและฟังก์ชันเกี่ยวกับการ login ที่ทุกหน้าใช้ร่วมกัน
type AuthContextValue = {
  // ผู้ใช้ที่ login อยู่ หรือ null
  user: User | null;
  // true ระหว่างเช็กว่ายัง login อยู่ไหมตอนเปิดเว็บครั้งแรก
  loading: boolean;
  // เข้าสู่ระบบ
  login: (username: string, password: string) => Promise<void>;
  // สมัครสมาชิก (สมัครแล้ว login ให้ทันที)
  register: (username: string, password: string) => Promise<void>;
  // ออกจากระบบ
  logout: () => Promise<void>;
  // บันทึกว่าดูคู่มือแนะนำแล้ว
  markOnboarded: () => Promise<void>;
};

// สร้าง context
const AuthContext = createContext<AuthContextValue | null>(null);

// ตัวครอบแอป เก็บสถานะ login ไว้ที่เดียว
export function AuthProvider({ children }: { children: ReactNode }) {
  // ผู้ใช้ปัจจุบัน
  const [user, setUser] = useState<User | null>(null);
  // สถานะกำลังเช็ก
  const [loading, setLoading] = useState(true);

  // ตอนเปิดเว็บ ถาม gateway ว่า cookie ที่มีอยู่ยังใช้ได้ไหม
  useEffect(() => {
    api<{ user: User }>('/auth/me')
      // ใช้ได้ ตั้งผู้ใช้
      .then((r) => setUser(r.user))
      // ใช้ไม่ได้ ถือว่ายังไม่ login
      .catch(() => setUser(null))
      // เช็กเสร็จแล้ว
      .finally(() => setLoading(false));
  }, []);

  // ถ้า session หมดอายุระหว่างใช้งาน (API ตอบ 401) ให้ล้างผู้ใช้ หน้าเว็บจะพาไปหน้า login เอง
  useEffect(() => {
    // ฟังก์ชันที่ทำเมื่อได้รับ event
    const onExpired = () => setUser(null);
    // เริ่มฟัง
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    // เลิกฟังเมื่อ component ถูกถอด
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  // เข้าสู่ระบบ แล้วเก็บผู้ใช้
  const login = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: User }>('/auth/login', { method: 'POST', body: { username, password } });
    setUser(r.user);
  }, []);

  // สมัครสมาชิก แล้วเก็บผู้ใช้
  const register = useCallback(async (username: string, password: string) => {
    const r = await api<{ user: User }>('/auth/register', { method: 'POST', body: { username, password } });
    setUser(r.user);
  }, []);

  // ออกจากระบบ ล้างผู้ใช้แม้ server จะตอบ error
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  // บันทึกว่าดูคู่มือแล้ว: อัปเดตหน้าจอทันที แล้วค่อยบันทึกที่ server (ถ้าบันทึกไม่สำเร็จ คู่มือจะขึ้นอีกครั้งตอนเข้าใช้ครั้งหน้า ไม่มีผลเสีย)
  const markOnboarded = useCallback(async () => {
    // อัปเดตผู้ใช้ในหน้าจอ
    setUser((u) => (u ? { ...u, onboardedAt: u.onboardedAt ?? new Date().toISOString() } : u));
    // บันทึกที่ server
    await api('/auth/onboarding', { method: 'POST' }).catch(() => undefined);
  }, []);

  // ส่งข้อมูลให้ทุก component ข้างใน
  return <AuthContext.Provider value={{ user, loading, login, register, logout, markOnboarded }}>{children}</AuthContext.Provider>;
}

// hook สำหรับอ่านข้อมูล login ใน component
export function useAuth() {
  // อ่าน context
  const ctx = useContext(AuthContext);
  // ถ้าใช้นอก AuthProvider ถือว่าเขียนโค้ดผิด
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  // คืนข้อมูล
  return ctx;
}

// ตัวครอบหน้าที่ต้อง login ก่อน
export function RequireAuth({ children }: { children: ReactNode }) {
  // อ่านสถานะ login
  const { user, loading } = useAuth();
  // ตำแหน่งปัจจุบัน เก็บไว้พากลับมาหลัง login
  const location = useLocation();
  // ระหว่างเช็ก แสดงข้อความรอ
  if (loading) return <div className="grid min-h-screen place-items-center text-slate-500">...</div>;
  // ยังไม่ login พาไปหน้า login พร้อมจำหน้าที่ต้องการ
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // login แล้ว แสดงหน้าได้
  return <>{children}</>;
}
