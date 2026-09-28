import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, ApiError, type BlockedDomain, type FeedStatus } from '../../api';
import { useFormat } from '../../format';
import { useResource } from '../../hooks';
import { useErrorText, useI18n } from '../../i18n';
import { buttonCls, inputCls } from '../../components/styles';
import { Card, FieldError, LoadError } from '../../components/ui';

type Blocklist = { builtIn: string[]; items: BlockedDomain[]; feed: FeedStatus };

export function AdminBlocklist() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fmt = useFormat();
  const { data, error, reload } = useResource<Blocklist>('/admin/blocklist');
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [domainError, setDomainError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [refreshingFeed, setRefreshingFeed] = useState(false);

  const refreshFeed = async () => {
    setRefreshingFeed(true);
    try {
      await api('/admin/blocklist/refresh-feeds', { method: 'POST' });
      toast.success(t('admin.feedRefreshedToast'));
      reload();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRefreshingFeed(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setDomainError(undefined);
    try {
      await api('/admin/blocklist', { method: 'POST', body: { domain, reason } });
      toast.success(t('admin.blockedToast'));
      setDomain('');
      setReason('');
      reload();
    } catch (err) {
      if (err instanceof ApiError) setDomainError(err.fieldError('domain') ?? errorText(err));
      else toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: BlockedDomain) => {
    try {
      await api(`/admin/blocklist/${item.id}`, { method: 'DELETE' });
      toast.success(t('admin.unblockedToast'));
      reload();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={add} className="max-w-3xl space-y-3" noValidate>
        <h2 className="text-lg font-bold">{t('admin.blockTitle')}</h2>
        <p className="max-w-[65ch] text-sm text-slate-600">{t('admin.blockHint')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <div>
            <label htmlFor="block-domain" className="mb-1 block text-sm font-medium">
              {t('admin.blockDomain')}
            </label>
            <input
              id="block-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder={t('admin.blockDomainPlaceholder')}
              className={inputCls}
            />
            <FieldError message={domainError} />
          </div>
          <div>
            <label htmlFor="block-reason" className="mb-1 block text-sm font-medium">
              {t('admin.blockReason')}
            </label>
            <input id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
          </div>
          <button type="submit" disabled={busy || !domain.trim()} className={buttonCls('primary', 'lg', 'sm:mt-7')}>
            {t('admin.blockAdd')}
          </button>
        </div>
      </form>

      {error && <LoadError message={error} onRetry={reload} />}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t('admin.customList')}</h2>
        <Card className="p-0">
          {data && data.items.length === 0 && <p className="px-5 py-6 text-slate-500">{t('admin.customEmpty')}</p>}
          <ul className="divide-y divide-line">
            {data?.items.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{b.domain}</div>
                  {b.reason && <div className="text-sm text-slate-600">{b.reason}</div>}
                  <div className="text-xs text-slate-500">
                    {t('admin.addedBy', { name: b.createdBy ?? '-', date: fmt.dateTime(b.createdAt) })}
                  </div>
                </div>
                <button onClick={() => remove(b)} className={buttonCls('ghost', 'row')}>
                  {t('admin.unblock')}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {data && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{t('admin.feedTitle')}</h2>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="text-sm text-slate-600">
              <div>{t('admin.feedCount', { count: data.feed.domainCount })}</div>
              <div>
                {data.feed.lastUpdatedAt
                  ? t('admin.feedUpdated', { date: fmt.dateTime(data.feed.lastUpdatedAt) })
                  : t('admin.feedNever')}
              </div>
            </div>
            <button onClick={refreshFeed} disabled={refreshingFeed} className={buttonCls('ghost', 'row')}>
              {refreshingFeed ? t('admin.feedRefreshing') : t('admin.feedRefresh')}
            </button>
          </Card>
        </section>
      )}

      {data && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">{t('admin.builtInList')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {data.builtIn.map((d) => (
              <span key={d} className="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-slate-700">
                {d}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
