import { useState } from 'react';
import { toast } from 'sonner';
import { api, type AdminUser } from '../../api';
import { useAuth } from '../../auth';
import { useFormat } from '../../format';
import { useErrorText, useI18n } from '../../i18n';
import { buttonCls, inputCls } from '../../components/styles';
import { Card, ConfirmDialog, LoadError, Pager } from '../../components/ui';
import { ADMIN_PAGE_SIZE, usePagedList } from './usePagedList';

export function AdminUsers() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fmt = useFormat();
  const { user: me } = useAuth();
  const { data, error, reload, search, setSearch, page, setPage } = usePagedList<AdminUser>('/admin/users');
  const [toSuspend, setToSuspend] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  const setActive = async (u: AdminUser, isActive: boolean) => {
    setBusy(true);
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { isActive } });
      toast.success(isActive ? t('admin.unsuspendedToast') : t('admin.suspendedToast'));
      setToSuspend(null);
      reload();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('admin.searchUsers')}
        aria-label={t('admin.searchUsers')}
        className={`${inputCls} max-w-sm`}
      />
      {error && <LoadError message={error} onRetry={reload} />}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t('admin.colUser')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colRole')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('admin.colLinks')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colJoined')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colAccount')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium">
                    {u.username}{' '}
                    {u.id === me?.id && <span className="font-normal text-slate-500">{t('admin.you')}</span>}
                  </td>
                  <td className="px-4 py-3">{u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}</td>
                  <td className="tabular px-4 py-3 text-right">{fmt.number(u.linkCount)}</td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-slate-500">{fmt.dateTime(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <AccountState active={u.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.role !== 'admin' &&
                      (u.isActive ? (
                        <button onClick={() => setToSuspend(u)} className={buttonCls('ghostDanger', 'row')}>
                          {t('admin.suspend')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setActive(u, true)}
                          disabled={busy}
                          className={buttonCls('ghost', 'row')}
                        >
                          {t('admin.unsuspend')}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pager page={page} pageSize={ADMIN_PAGE_SIZE} total={data.total} onPage={setPage} />}
      </Card>

      <ConfirmDialog
        open={!!toSuspend}
        title={t('admin.suspendTitle', { name: toSuspend?.username ?? '' })}
        message={t('admin.suspendMessage', { name: toSuspend?.username ?? '' })}
        confirmLabel={t('admin.suspend')}
        busy={busy}
        onConfirm={() => toSuspend && setActive(toSuspend, false)}
        onCancel={() => setToSuspend(null)}
      />
    </div>
  );
}

function AccountState({ active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1.5 ${active ? 'text-green-700' : 'text-brand'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-green-600' : 'bg-brand'}`} aria-hidden />
      {active ? t('admin.accountActive') : t('admin.accountSuspended')}
    </span>
  );
}
