// นำเข้าตัวแสดงหน้าย่อย ลิงก์เมนู และตัวเปลี่ยนหน้า
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
// นำเข้าชนิดข้อมูลของสิ่งที่ React แสดงได้ (ใช้กับไอคอน)
import { useEffect, useState, type ReactNode } from 'react';
// นำเข้าข้อมูล login
import { useAuth } from '../auth';
// นำเข้าภาษา
import { useI18n } from '../i18n';
// นำเข้าธีม
import { useTheme, type ThemeChoice } from '../theme';
// นำเข้าคู่มือแนะนำการใช้งาน
import { Tour, type TourStep } from './Tour';

// โลโก้จริงของ Synerry ตามด้วยชื่อบริการ
// light = วางบนพื้นเข้ม (หัวเว็บ หน้า login) ใช้โลโก้ที่แปลงส่วนสีดำเป็นสีอ่อน, ไม่ใส่ = พื้นขาว (ตอนพิมพ์) ใช้โลโก้สีเดิม
// size = lg ใช้ในหน้า login ที่โลโก้เป็นจุดเด่น
export function Brand({ light = false, size = 'md' }: { light?: boolean; size?: 'md' | 'lg' }) {
  // ไฟล์โลโก้เต็มและเครื่องหมายตามพื้นหลัง
  const logo = light ? '/synerry-logo-dark.png' : '/synerry-logo.png';
  const mark = light ? '/synerry-mark-dark.png' : '/synerry-mark.png';
  // ความสูงของโลโก้ (ความกว้างปรับตามสัดส่วนเอง)
  const height = size === 'lg' ? 'h-14' : 'h-9';
  return (
    <span className={`inline-flex items-center gap-3 ${light ? 'text-white' : 'text-navy'}`}>
      {/* โลโก้เต็ม บนจอกว้าง และตอนพิมพ์ */}
      <img src={logo} alt="Synerry" className={`${height} w-auto ${size === 'md' ? 'hidden sm:block print:block' : ''}`} />
      {/* เครื่องหมายอย่างเดียว บนจอแคบ (โลโก้เต็มจะเล็กจนอ่านไม่ออก) */}
      {size === 'md' && <img src={mark} alt="Synerry" className="h-8 w-auto sm:hidden print:hidden" />}
      {/* เส้นคั่นบาง */}
      <span className="h-7 w-px bg-current opacity-25" aria-hidden />
      {/* ชื่อบริการ */}
      <span className={`whitespace-nowrap font-semibold ${size === 'lg' ? 'text-xl' : ''}`}>Short URL</span>
    </span>
  );
}

// ไอคอนของตัวเลือกธีม วาดด้วย SVG เส้นหนาเท่ากันทั้งชุด
const THEME_ICONS: Record<ThemeChoice, ReactNode> = {
  // ดวงอาทิตย์ = โหมดสว่าง
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  // พระจันทร์เสี้ยว = โหมดมืด
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  // จอคอมพิวเตอร์ = ตามการตั้งค่าของเครื่อง
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
};

// ลำดับปุ่มธีม: สว่าง มืด ตามระบบ
const THEME_ORDER: ThemeChoice[] = ['light', 'dark', 'system'];

// class ของปุ่มในกลุ่มปุ่มแบบเลือกหนึ่งอย่าง (ใช้ทั้งภาษาและธีม ให้หน้าตาเป็นชุดเดียวกัน)
const segBtn = (active: boolean) =>
  `grid h-7 min-w-7 place-items-center rounded-md px-2 text-xs font-semibold transition-colors duration-150 ${
    active ? 'bg-white text-header shadow-sm' : 'text-white/65 hover:bg-white/10 hover:text-white'
  }`;

// ปุ่มสลับภาษาและธีม ใช้ทั้งหัวเว็บและหน้า login
export function Preferences() {
  // ภาษาและฟังก์ชันเปลี่ยนภาษา
  const { lang, setLang, t } = useI18n();
  // ธีมและฟังก์ชันเปลี่ยนธีม
  const { choice, setChoice } = useTheme();
  return (
    <div className="flex items-center gap-2" data-tour="prefs">
      {/* สลับภาษา ไทย/อังกฤษ */}
      <div className="flex gap-0.5 rounded-lg bg-white/10 p-0.5" role="group" aria-label="Language">
        <button type="button" onClick={() => setLang('th')} aria-pressed={lang === 'th'} className={segBtn(lang === 'th')}>TH</button>
        <button type="button" onClick={() => setLang('en')} aria-pressed={lang === 'en'} className={segBtn(lang === 'en')}>EN</button>
      </div>
      {/* เลือกธีม: ปุ่มไอคอนสามปุ่ม ชี้แล้วมีชื่อบอก และโปรแกรมอ่านหน้าจออ่านชื่อได้ */}
      <div className="flex gap-0.5 rounded-lg bg-white/10 p-0.5" role="group" aria-label="Theme">
        {THEME_ORDER.map((option) => {
          // ชื่อของตัวเลือก
          const label = t(`theme.${option}`);
          return (
            <button key={option} type="button" onClick={() => setChoice(option)} aria-pressed={choice === option} aria-label={label} title={label} className={segBtn(choice === option)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {THEME_ICONS[option]}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// class ของเมนู เปลี่ยนสีเมื่อเป็นหน้าปัจจุบัน
const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white'}`;

// โครงหน้าหลักหลัง login: หัวเว็บ เมนู และพื้นที่แสดงหน้า
export function Layout() {
  // ข้อมูลผู้ใช้ ฟังก์ชันออกจากระบบ และบันทึกว่าดูคู่มือแล้ว
  const { user, logout, markOnboarded } = useAuth();
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวเปลี่ยนหน้า
  const navigate = useNavigate();
  // หน้าปัจจุบัน
  const location = useLocation();
  // กำลังแสดงคู่มืออยู่หรือไม่
  const [touring, setTouring] = useState(false);

  // ผู้ใช้ที่ยังไม่เคยดูคู่มือ เปิดคู่มือให้อัตโนมัติเมื่ออยู่หน้าแรก (หน้าที่มีช่องย่อลิงก์ให้ชี้)
  useEffect(() => {
    if (user && !user.onboardedAt && location.pathname === '/') setTouring(true);
  }, [user, location.pathname]);

  // ขั้นของคู่มือ ขั้นเมนูผู้ดูแลมีเฉพาะผู้ดูแล
  const tourSteps: TourStep[] = [
    { id: 'welcome' },
    { id: 'url', target: 'url' },
    { id: 'options', target: 'options' },
    { id: 'history', target: 'nav-links' },
    { id: 'trash', target: 'nav-trash' },
    { id: 'prefs', target: 'prefs' },
    ...(user?.role === 'admin' ? [{ id: 'admin', target: 'nav-admin' }] : []),
    { id: 'helpBtn', target: 'help' },
  ];

  // ปิดคู่มือ (ดูจบหรือกดข้าม) แล้วบันทึกว่าดูแล้ว
  const finishTour = () => {
    setTouring(false);
    markOnboarded();
  };

  // เปิดคู่มืออีกครั้งจากปุ่ม ? (พากลับหน้าแรกก่อน เพราะขั้นแรกๆ ชี้ช่องย่อลิงก์)
  const replayTour = () => {
    if (location.pathname !== '/') navigate('/');
    setTouring(true);
  };

  // ออกจากระบบแล้วพาไปหน้า login
  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      {/* หัวเว็บสีกรมท่า มีเส้นแดงด้านล่างตามแบรนด์ ไม่พิมพ์ตอนพิมพ์รายงาน */}
      <header className="border-b-2 border-brand bg-header print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          {/* โลโก้ กดแล้วกลับหน้าแรก */}
          <NavLink to="/" className="mr-2">
            <Brand light />
          </NavLink>
          {/* เมนูหลัก */}
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>{t('nav.overview')}</NavLink>
            <NavLink to="/links" end className={navClass} data-tour="nav-links">{t('nav.links')}</NavLink>
            <NavLink to="/trash" className={navClass} data-tour="nav-trash">{t('nav.trash')}</NavLink>
            {/* เมนูผู้ดูแล แสดงเฉพาะผู้ดูแล (ตัวตรวจสิทธิ์จริงอยู่ที่ gateway) */}
            {user?.role === 'admin' && <NavLink to="/admin" className={navClass} data-tour="nav-admin">{t('nav.admin')}</NavLink>}
          </nav>
          {/* วิธีใช้ ภาษา ธีม ชื่อผู้ใช้ และปุ่มออกจากระบบ ชิดขวา */}
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-white/80">
            {/* ปุ่มเปิดคู่มือวิธีใช้งานอีกครั้ง */}
            <button
              type="button"
              onClick={replayTour}
              aria-label={t('tour.help')}
              title={t('tour.help')}
              data-tour="help"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3" />
                <path d="M12 17h.01" />
              </svg>
            </button>
            <Preferences />
            <span className="hidden sm:inline">
              {t('nav.user')}: <strong className="text-white">{user?.username}</strong>
            </span>
            <button onClick={onLogout} className="rounded-lg border border-white/30 px-3 py-1.5 text-white hover:bg-white/10">
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>
      {/* พื้นที่แสดงหน้าย่อยตาม URL */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        <Outlet />
      </main>
      {/* คู่มือแนะนำการใช้งาน */}
      {touring && <Tour steps={tourSteps} onFinish={finishTour} />}
    </div>
  );
}
