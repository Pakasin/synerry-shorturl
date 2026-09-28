import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, type Link } from '../api';
import { useFormat } from '../format';
import { useErrorText, useI18n } from '../i18n';
import { buttonCls } from '../components/styles';
import { Card, ConfirmDialog } from '../components/ui';

export function Trash() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fmt = useFormat();
  const [items, setItems] = useState<Link[] | null>(null);
  const [retention, setRetention] = useState(30);
  const [toDelete, setToDelete] = useState<Link | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Link[]; retentionDays: number }>('/links/trash');
      setItems(r.items);
      setRetention(r.retentionDays);
    } catch (err) {
      toast.error(errorText(err));
    }
  }, [errorText]);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (link: Link) => {
    try {
      await api(`/links/${link.id}/restore`, { method: 'POST' });
      toast.success(t('trash.restoredToast'));
      load();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const deleteForever = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/links/${toDelete.id}/permanent`, { method: 'DELETE' });
      toast.success(t('trash.deletedToast'));
      setToDelete(null);
      load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const daysLeft = (deletedAt: string | null) =>
    deletedAt
      ? Math.max(0, retention - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000))
      : retention;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('trash.title')}</h1>
        <p className="text-sm text-slate-500">{t('trash.subtitle', { days: retention })}</p>
      </div>

      <Card className="p-0">
        {items === null && <p className="px-5 py-8 text-center text-slate-500">{t('common.loading')}</p>}
        {items?.length === 0 && <p className="px-5 py-8 text-center text-slate-500">{t('trash.empty')}</p>}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.title || t('common.untitled')}</div>
                  <div className="truncate text-sm text-slate-500">
                    <span className="font-medium text-slate-700">/{l.shortCode}</span> {t('shorten.goesTo')}{' '}
                    {l.originalUrl}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t('trash.deletedAt')} {fmt.dateTime(l.deletedAt)},{' '}
                    <strong>{t('trash.daysLeft', { n: daysLeft(l.deletedAt) })}</strong>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => restore(l)} className={buttonCls('dark')}>
                    {t('trash.restore')}
                  </button>
                  <button onClick={() => setToDelete(l)} className={buttonCls('danger')}>
                    {t('trash.deleteForever')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title={t('trash.confirmTitle')}
        message={t('trash.confirmMessage', { code: toDelete?.shortCode ?? '' })}
        confirmLabel={t('trash.deleteForever')}
        busy={busy}
        onConfirm={deleteForever}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
