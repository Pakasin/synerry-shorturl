import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link as RouterLink } from 'react-router';
import { api, type Link, type Summary } from '../api';
import { takePendingUrl } from '../pendingLink';
import { useFormat } from '../format';
import { useErrorText, useI18n } from '../i18n';
import { ShortenForm } from '../components/ShortenForm';
import { LinkTag } from '../components/LinkTag';
import { buttonCls } from '../components/styles';
import { Notice, StatStrip } from '../components/ui';

export function Dashboard() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fmt = useFormat();
  const [created, setCreated] = useState<Link | null>(null);
  const [retryUrl, setRetryUrl] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);

  const loadSummary = useCallback(() => {
    api<Summary>('/stats/summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  useEffect(loadSummary, [loadSummary]);

  const onCreated = (link: Link) => {
    setCreated(link);
    loadSummary();
  };

  useEffect(() => {
    const pendingUrl = takePendingUrl();
    if (!pendingUrl) return;
    api<{ link: Link }>('/links', { method: 'POST', body: { url: pendingUrl } })
      .then((r) => {
        setCreated(r.link);
        loadSummary();
      })
      .catch((err) => {
        setRetryUrl(pendingUrl);
        toast.error(errorText(err));
      });
  }, [loadSummary, errorText]);

  const topMax = Math.max(1, ...(summary?.topLinks.map((l) => l.clicks ?? 0) ?? [0]));

  return (
    <div className="space-y-10">
      <section className="max-w-3xl pt-2">
        <h1 className="text-[1.75rem] font-bold leading-tight sm:text-display">{t('shorten.title')}</h1>
        <p className="mb-6 mt-2 max-w-[60ch] text-slate-600">{t('shorten.subtitle')}</p>
        <ShortenForm key={retryUrl} initialUrl={retryUrl} onCreated={onCreated} />
      </section>

      {created && (
        <section aria-live="polite" className="max-w-3xl">
          <p className="mb-3 text-sm font-medium text-green-700">{t('shorten.created')}</p>
          <LinkTag
            key={created.id}
            link={created}
            animate
            extraActions={
              <RouterLink to={`/links/${created.id}`} className={buttonCls()}>
                {t('common.stats')}
              </RouterLink>
            }
          />
        </section>
      )}

      <StatStrip
        items={[
          { label: t('dashboard.totalLinks'), value: fmt.number(summary?.totalLinks) },
          { label: t('dashboard.activeLinks'), value: fmt.number(summary?.activeLinks) },
          {
            label: t('dashboard.totalClicks'),
            value: fmt.number(summary?.totalClicks),
            hint: t('dashboard.clicksHint'),
          },
        ]}
      />

      {summary && !summary.analyticsAvailable && <Notice>{t('dashboard.analyticsDown')}</Notice>}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold">{t('dashboard.topLinks')}</h2>
          <RouterLink to="/links" className="text-sm font-medium text-brand hover:underline">
            {t('dashboard.viewAll')}
          </RouterLink>
        </div>
        {!summary || summary.topLinks.length === 0 ? (
          <p className="text-slate-500">{t('dashboard.noClicks')}</p>
        ) : (
          <ol className="space-y-4">
            {summary.topLinks.map((l, i) => (
              <li key={l.id}>
                <RouterLink
                  to={`/links/${l.id}`}
                  className="group grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3"
                >
                  <span className="tabular text-sm font-semibold text-slate-500">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium group-hover:underline">{l.title || l.originalUrl}</span>
                    <span className="block truncate text-sm text-slate-500">/{l.shortCode}</span>
                  </span>
                  <span className="tabular text-sm font-semibold">
                    {t('common.clicks', { n: fmt.number(l.clicks) })}
                  </span>
                  <span className="col-start-2 col-end-4 mt-1.5 h-1.5 rounded-full bg-slate-100">
                    <span
                      className="block h-1.5 rounded-full bg-data"
                      style={{ width: `${((l.clicks ?? 0) / topMax) * 100}%` }}
                    />
                  </span>
                </RouterLink>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
