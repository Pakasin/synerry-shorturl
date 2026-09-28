import { Navigate, NavLink, Outlet } from 'react-router';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';

const tabCls = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-brand text-navy' : 'border-transparent text-slate-500 hover:text-navy'}`;

export function AdminLayout() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
      <nav className="-mx-1 flex overflow-x-auto border-b border-line" aria-label={t('admin.title')}>
        <NavLink to="/admin" end className={tabCls}>
          {t('admin.tabOverview')}
        </NavLink>
        <NavLink to="/admin/users" className={tabCls}>
          {t('admin.tabUsers')}
        </NavLink>
        <NavLink to="/admin/links" className={tabCls}>
          {t('admin.tabLinks')}
        </NavLink>
        <NavLink to="/admin/blocklist" className={tabCls}>
          {t('admin.tabBlocklist')}
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
