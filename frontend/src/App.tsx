// นำเข้าตัวโหลด component แบบแยกไฟล์ และตัวแสดงระหว่างรอ
import { lazy, Suspense } from 'react';
// นำเข้าตัวจัดการ URL ของหน้าเว็บ
import { BrowserRouter, Link as RouterLink, Route, Routes } from 'react-router';
// นำเข้าตัวแสดงแจ้งเตือนมุมจอ
import { Toaster } from 'sonner';
// นำเข้าตัวจัดการ login และตัวครอบหน้าที่ต้อง login
import { AuthProvider, RequireAuth } from './auth';
// นำเข้าตัวจัดการภาษา
import { I18nProvider, useI18n } from './i18n';
// นำเข้าตัวจัดการธีม
import { ThemeProvider, useTheme } from './theme';
// นำเข้าโครงหน้าหลัก
import { Layout } from './components/Layout';
// นำเข้าหน้าต่างๆ
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Trash } from './pages/Trash';

// หน้ารายละเอียดใช้ไลบรารีกราฟและข้อมูลแผนที่ที่ใหญ่ จึงแยกไฟล์ โหลดเฉพาะตอนเปิดหน้านี้ หน้าแรกจะโหลดเร็วขึ้น
const LinkDetail = lazy(() => import('./pages/LinkDetail').then((m) => ({ default: m.LinkDetail })));
// หน้าผู้ดูแลแยกไฟล์ ผู้ใช้ทั่วไปจะไม่ต้องโหลดโค้ดส่วนนี้เลย
const AdminLayout = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminLayout })));
const AdminOverview = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminOverview })));
const AdminUsers = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminUsers })));
const AdminLinks = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminLinks })));
const AdminBlocklist = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminBlocklist })));

// ข้อความระหว่างโหลดไฟล์ของหน้าที่แยกไว้
const pageFallback = <p className="text-slate-500">...</p>;

// หน้าไม่พบ สำหรับ URL ที่ไม่มีอยู่
function NotFound() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <RouterLink to="/" className="mt-4 inline-block font-semibold text-brand hover:underline">{t('notFound.home')}</RouterLink>
    </div>
  );
}

// แจ้งเตือนมุมจอ ใช้สีตามธีม
function ThemedToaster() {
  // ธีมที่ใช้จริง
  const { resolved } = useTheme();
  return <Toaster position="top-right" richColors closeButton theme={resolved} />;
}

// โครงสร้างหน้าเว็บทั้งหมด
export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* หน้าที่ไม่ต้อง login */}
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />
              {/* หน้าที่ต้อง login อยู่ใต้โครงหน้าหลัก */}
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="links" element={<History />} />
                <Route path="links/:id" element={<Suspense fallback={pageFallback}><LinkDetail /></Suspense>} />
                {/* หน้าผู้ดูแล */}
                <Route path="admin" element={<Suspense fallback={pageFallback}><AdminLayout /></Suspense>}>
                  <Route index element={<AdminOverview />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="links" element={<AdminLinks />} />
                  <Route path="blocklist" element={<AdminBlocklist />} />
                </Route>
                <Route path="trash" element={<Trash />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
          {/* แจ้งเตือนมุมบนขวา */}
          <ThemedToaster />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
