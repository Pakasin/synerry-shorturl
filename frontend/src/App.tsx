import { lazy, Suspense } from 'react';
import { BrowserRouter, Link as RouterLink, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider, RequireAuth } from './auth';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider, useTheme } from './theme';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Trash } from './pages/Trash';

const LinkDetail = lazy(() => import('./pages/LinkDetail').then((m) => ({ default: m.LinkDetail })));
const AdminLayout = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminLayout })));
const AdminOverview = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminOverview })));
const AdminUsers = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminUsers })));
const AdminLinks = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminLinks })));
const AdminBlocklist = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminBlocklist })));

const pageFallback = <p className="text-slate-500">...</p>;

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <RouterLink to="/" className="mt-4 inline-block font-semibold text-brand hover:underline">
        {t('notFound.home')}
      </RouterLink>
    </div>
  );
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster position="top-right" richColors closeButton theme={resolved} />;
}

export function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="links" element={<History />} />
                <Route
                  path="links/:id"
                  element={
                    <Suspense fallback={pageFallback}>
                      <LinkDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="admin"
                  element={
                    <Suspense fallback={pageFallback}>
                      <AdminLayout />
                    </Suspense>
                  }
                >
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
          <ThemedToaster />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
