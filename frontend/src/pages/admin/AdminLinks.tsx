import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, type AdminLink } from '../../api';
import { useFormat } from '../../format';
import { useErrorText, useI18n } from '../../i18n';
import { buttonCls, inputCls } from '../../components/styles';
import { Card, ConfirmDialog, FieldError, FilterChip, LoadError, Pager, StatusBadge } from '../../components/ui';
import { ADMIN_PAGE_SIZE, usePagedList } from './usePagedList';

type LinkFilter = 'all' | 'locked';

export function AdminLinks() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fmt = useFormat();
  const [filter, setFilter] = useState<LinkFilter>('all');
  const { data, error, reload, search, setSearch, page, setPage } = usePagedList<AdminLink>('/admin/links', { filter });
  const [toLock, setToLock] = useState<AdminLink | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const openLock = (l: AdminLink) => {
    setToLock(l);
    setReason('');
    setReasonError(undefined);
  };

  const lock = async () => {
    if (!toLock) return;
    setBusy(true);
    try {
      await api(`/admin/links/${toLock.id}/lock`, { method: 'POST', body: { reason } });
      toast.success(t('admin.lockedToast'));
      setToLock(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.fieldError('reason')) setReasonError(err.fieldError('reason'));
      else toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (l: AdminLink) => {
    try {
      await api(`/admin/links/${l.id}/unlock`, { method: 'POST' });
      toast.success(t('admin.unlockedToast'));
      reload();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.searchLinks')}
          aria-label={t('admin.searchLinks')}
          className={`${inputCls} max-w-sm`}
        />
        <div className="flex gap-2" role="group">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('admin.filterAll')}
          </FilterChip>
          <FilterChip active={filter === 'locked'} onClick={() => setFilter('locked')}>
            {t('admin.filterLocked')}
          </FilterChip>
        </div>
      </div>
      {error && <LoadError message={error} onRetry={reload} />}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t('history.colLink')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colOwner')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colClicks')}</th>
                <th className="px-4 py-3 font-medium">{t('history.colStatus')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.items.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="max-w-[320px] px-4 py-3">
                    <a
                      href={l.shortUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-brand hover:underline"
                    >
                      /{l.shortCode}
                    </a>
                    <div className="truncate text-slate-500" title={l.originalUrl}>
                      {l.originalUrl}
                    </div>
                    {l.lockReason && (
                      <div className="mt-1 text-xs text-brand">
                        {t('detail.lockedReason', { reason: l.lockReason })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {l.owner}
                    {!l.ownerActive && <div className="text-xs text-brand">{t('admin.accountSuspended')}</div>}
                  </td>
                  <td className="tabular px-4 py-3 text-right font-semibold">{fmt.number(l.clicks)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {l.lockedAt ? (
                      <button onClick={() => unlock(l)} className={buttonCls('ghost', 'row')}>
                        {t('admin.unlock')}
                      </button>
                    ) : (
                      <button onClick={() => openLock(l)} className={buttonCls('ghostDanger', 'row')}>
                        {t('admin.lock')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {t('history.noMatch')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && <Pager page={page} pageSize={ADMIN_PAGE_SIZE} total={data.total} onPage={setPage} />}
      </Card>

      <ConfirmDialog
        open={!!toLock}
        title={t('admin.lockTitle', { code: toLock?.shortCode ?? '' })}
        message={t('admin.lockMessage')}
        confirmLabel={t('admin.lock')}
        busy={busy}
        onConfirm={lock}
        onCancel={() => setToLock(null)}
      >
        <div className="mt-4">
          <label htmlFor="lock-reason" className="mb-1 block text-sm font-medium">
            {t('admin.lockReason')}
          </label>
          <input
            id="lock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('admin.lockReasonPlaceholder')}
            className={inputCls}
          />
          <FieldError message={reasonError} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
