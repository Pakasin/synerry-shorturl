// นำเข้า state ของ React
import { useState, type FormEvent } from 'react';
// นำเข้าลิงก์ ตัวพาไปหน้าอื่น และตัวอ่านตำแหน่ง
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router';
// นำเข้าข้อมูล login
import { useAuth } from '../auth';
// นำเข้าชนิด error ของ API
import { ApiError } from '../api';
// นำเข้าภาษาและตัวแปลง error
import { useErrorText, useI18n } from '../i18n';
// นำเข้าโลโก้และปุ่มตั้งค่า
import { Brand, Preferences } from '../components/Layout';
// นำเข้า class ช่องกรอกและข้อความ error ใต้ช่อง
import { FieldError, inputCls } from '../components/ShortenForm';

// หน้า login และสมัครสมาชิก ใช้ component เดียวกัน ต่างกันที่ mode
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  // ฟังก์ชันและสถานะ login
  const { user, login, register } = useAuth();
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวเปลี่ยนหน้า
  const navigate = useNavigate();
  // ตำแหน่งปัจจุบัน ใช้อ่านหน้าที่ผู้ใช้ตั้งใจจะไปก่อนโดนพามา login
  const location = useLocation();
  // ชื่อผู้ใช้ที่กรอก
  const [username, setUsername] = useState('');
  // รหัสผ่านที่กรอก
  const [password, setPassword] = useState('');
  // กำลังส่งข้อมูล
  const [busy, setBusy] = useState(false);
  // error ล่าสุด
  const [error, setError] = useState<unknown>(null);
  // หน้าที่จะพาไปหลัง login สำเร็จ
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  // true ถ้าเป็นหน้าสมัครสมาชิก
  const isRegister = mode === 'register';

  // login อยู่แล้ว พาไปหน้าหลักเลย
  if (user) return <Navigate to={from} replace />;

  // ส่งฟอร์ม
  const submit = async (e: FormEvent) => {
    // ไม่ให้ browser โหลดหน้าใหม่
    e.preventDefault();
    // เริ่มส่ง
    setBusy(true);
    // ล้าง error เดิม
    setError(null);
    try {
      // เรียก login หรือสมัคร ตาม mode
      await (isRegister ? register(username, password) : login(username, password));
      // สำเร็จ พาไปหน้าที่ตั้งใจไว้
      navigate(from, { replace: true });
    } catch (err) {
      // เก็บ error ไว้แสดง
      setError(err);
    } finally {
      // ส่งเสร็จ
      setBusy(false);
    }
  };

  // error ของแต่ละช่อง (เฉพาะตอนสมัคร)
  const fieldError = (f: string) => (error instanceof ApiError ? error.fieldError(f) : undefined);

  return (
    <div className="relative grid min-h-screen place-items-center bg-header px-4 py-10">
      {/* ปุ่มภาษาและธีม มุมขวาบน */}
      <div className="absolute right-4 top-4">
        <Preferences />
      </div>
      <div className="w-full max-w-sm">
        {/* โลโก้และคำอธิบายระบบ */}
        <div className="mb-6 text-center">
          <div className="flex justify-center"><Brand light size="lg" /></div>
          <p className="mt-2 text-sm text-white/70">{t('app.tagline')}</p>
        </div>
        {/* กล่องฟอร์ม มีเส้นแดงด้านบนตามแบรนด์ */}
        <form onSubmit={submit} className="space-y-4 rounded-2xl border-t-4 border-brand bg-surface p-6 shadow-2xl" noValidate>
          <h1 className="text-xl font-bold">{isRegister ? t('auth.register') : t('auth.login')}</h1>
          {/* ข้อความ error รวม */}
          {error !== null && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand">{errorText(error)}</div>}
          {/* ช่องชื่อผู้ใช้ */}
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium">{t('auth.username')}</label>
            <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} required />
            {isRegister && <p className="mt-1 text-xs text-slate-500">{t('auth.usernameHint')}</p>}
            <FieldError message={fieldError('username')} />
          </div>
          {/* ช่องรหัสผ่าน autoComplete ต่างกันเพื่อให้ตัวจัดการรหัสผ่านของ browser ทำงานถูก */}
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
            />
            {isRegister && <p className="mt-1 text-xs text-slate-500">{t('auth.passwordHint')}</p>}
            <FieldError message={fieldError('password')} />
          </div>
          {/* ปุ่มส่ง */}
          <button type="submit" disabled={busy || !username || !password} className="w-full rounded-[10px] bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {busy ? t('common.processing') : isRegister ? t('auth.submitRegister') : t('auth.login')}
          </button>
          {/* ลิงก์สลับไปอีกหน้า */}
          <p className="text-center text-sm text-slate-600">
            {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <RouterLink to={isRegister ? '/login' : '/register'} state={location.state} className="font-semibold text-brand hover:underline">
              {isRegister ? t('auth.login') : t('auth.register')}
            </RouterLink>
          </p>
        </form>
        {/* บัญชีทดลองสำหรับผู้ตรวจ แสดงเฉพาะหน้า login */}
        {!isRegister && (
          <p className="mt-4 text-center text-sm text-white/70">
            {t('auth.demo')} <code className="text-white">demo</code> / <code className="text-white">Demo@1234</code>
          </p>
        )}
      </div>
    </div>
  );
}
