import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { toast } from 'sonner';
import { api, type LinkList, type LinkWithClicks } from '../api';
import { useFormat } from '../format';
import { useErrorText, useI18n } from '../i18n';
import { useDebounced } from '../hooks';
import { buttonCls, compactInputCls } from '../components/styles';
import {
  Card,
  ConfirmDialog,
  CopyButton,
  FilterChip,
  LoadError,
  Notice,
  Pager,
  StatusBadge,
  TagChip,
} from '../components/ui';

const PAGE_SIZE = 10;
const TRASH_DAYS = 30;

export function History() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fmt = useFormat();
  const [search, setSearch] = useState('');
  const query = useDebounced(search);
  const [tag, setTag] = useState('');
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LinkList | null>(null);
  const [loading, setLoading] = useState(true);
  const [toTrash, setToTrash] = useState<LinkWithClicks | null>(null);
  const [trashing, setTrashing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => setPage(1), [query]);

  const loadTags = useCallback(() => {
    api<{ tags: { name: string; count: number }[] }>('/links/tags')
      .then((r) => setTags(r.tags))
      .catch(() => setTags([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (query) params.set('q', query);
      if (tag) params.set('tag', tag);
      setData(await api<LinkList>(`/links?${params}`));
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [page, query, tag, errorText]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(loadTags, [loadTags]);

  const pickTag = (name: string) => {
    setTag(name);
    setPage(1);
  };

  const toggleActive = async (link: LinkWithClicks) => {
    try {
      await api(`/links/${link.id}`, { method: 'PATCH', body: { isActive: !link.isActive } });
      toast.success(link.isActive ? t('history.disabledToast') : t('history.enabledToast'));
      load();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const confirmTrash = async () => {
    if (!toTrash) return;
    setTrashing(true);
    try {
      await api(`/links/${toTrash.id}`, { method: 'DELETE' });
      toast.success(t('history.trashedToast'));
      setToTrash(null);
      loadTags();
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setTrashing(false);
    }
  };

  const filtering = !!query || !!tag;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{t('history.title')}</h1>
          <p className="text-sm text-slate-500">{t('history.subtitle')}</p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('history.search')}
          aria-label={t('history.search')}
          className={`${compactInputCls} lg:w-72`}
        />
        <div className="flex gap-2">
          <a
            href="/api/links/export.csv"
            className={buttonCls('outline', 'md', 'flex-1 whitespace-nowrap bg-surface text-center')}
          >
            {t('export.csv')}
          </a>
          <a
            href="/api/links/export.xlsx"
            className={buttonCls('outline', 'md', 'flex-1 whitespace-nowrap bg-surface text-center')}
          >
            {t('export.xlsx')}
          </a>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('tags.label')}>
          <FilterChip active={!tag} onClick={() => pickTag('')}>
            {t('tags.all')}
          </FilterChip>
          {tags.map((tg) => (
            <FilterChip key={tg.name} active={tag === tg.name} onClick={() => pickTag(tg.name)}>
              #{tg.name} <span className="tabular opacity-75">{tg.count}</span>
            </FilterChip>
          ))}
        </div>
      )}

      {data && !data.analyticsAvailable && <Notice>{t('history.analyticsDown')}</Notice>}

      {loadError && <LoadError message={loadError} onRetry={load} />}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="border-b border-line text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t('history.colLink')}</th>
                <th className="px-4 py-3 font-medium">{t('history.colShort')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colClicks')}</th>
                <th className="px-4 py-3 font-medium">{t('history.colStatus')}</th>
                <th className="px-4 py-3 font-medium">{t('history.colCreated')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((l) => (
                <tr key={l.id} className="align-top hover:bg-slate-50/60">
                  <td className="max-w-[280px] px-4 py-3">
                    <div className="truncate font-medium" title={l.title ?? l.originalUrl}>
                      {l.title || t('common.untitled')}
                    </div>
                    <div className="truncate text-slate-500" title={l.originalUrl}>
                      {l.originalUrl}
                    </div>
                    {l.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.tags.map((tg) => (
                          <TagChip key={tg} tag={tg} />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={l.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand hover:underline"
                      >
                        /{l.shortCode}
                      </a>
                      <CopyButton text={l.shortUrl} className="px-2 py-1 text-xs" />
                    </div>
                  </td>
                  <td className="tabular px-4 py-3 text-right font-semibold">{fmt.number(l.clicks)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-3 text-slate-500">{fmt.dateTime(l.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <RouterLink to={`/links/${l.id}`} className={buttonCls('ghost', 'row', 'inline-block text-navy')}>
                      {t('history.statsQr')}
                    </RouterLink>
                    {!l.lockedAt && (
                      <button onClick={() => toggleActive(l)} className={buttonCls('ghost', 'row', 'text-slate-600')}>
                        {l.isActive ? t('history.disable') : t('history.enable')}
                      </button>
                    )}
                    <button onClick={() => setToTrash(l)} className={buttonCls('ghostDanger', 'row')}>
                      {t('history.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {filtering ? t('history.noMatch') : t('history.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} loading={loading} onPage={setPage} />
      </Card>

      <ConfirmDialog
        open={!!toTrash}
        title={t('history.trashTitle')}
        message={t('history.trashMessage', { code: toTrash?.shortCode ?? '', days: TRASH_DAYS })}
        confirmLabel={t('history.trashConfirm')}
        busy={trashing}
        onConfirm={confirmTrash}
        onCancel={() => setToTrash(null)}
      />
    </div>
  );
}
