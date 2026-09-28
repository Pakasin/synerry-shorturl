import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, ApiError, type Link } from '../api';
import { fromLocalInput, useFormat } from '../format';
import { useErrorText, useI18n } from '../i18n';
import { TagInput } from './TagInput';
import { buttonCls, inputCls } from './styles';
import { ConfirmDialog, FieldError } from './ui';

export function ShortenForm({ onCreated, initialUrl = '' }: { onCreated: (link: Link) => void; initialUrl?: string }) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const fmt = useFormat();
  const [url, setUrl] = useState(initialUrl);
  const [alias, setAlias] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [duplicates, setDuplicates] = useState<Link[]>([]);

  const reset = () => {
    setUrl('');
    setAlias('');
    setTitle('');
    setTags([]);
    setStartsAt('');
    setExpiresAt('');
    setError(null);
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ link: Link }>('/links', {
        method: 'POST',
        body: {
          url,
          alias: alias || undefined,
          title: title || undefined,
          tags: tags.length ? tags : undefined,
          startsAt: fromLocalInput(startsAt) ?? undefined,
          expiresAt: fromLocalInput(expiresAt) ?? undefined,
        },
      });
      onCreated(r.link);
      reset();
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!alias) {
      try {
        const r = await api<{ items: Link[] }>(`/links/duplicates?url=${encodeURIComponent(url)}`);
        if (r.items.length) {
          setDuplicates(r.items);
          return;
        }
      } catch {}
    }
    await create();
  };

  const pickExisting = (link: Link) => {
    setDuplicates([]);
    onCreated(link);
    reset();
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row" data-tour="url">
        <div className="flex-1">
          <label htmlFor="url" className="sr-only">
            {t('shorten.urlLabel')}
          </label>
          <input
            id="url"
            type="url"
            inputMode="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('shorten.urlPlaceholder')}
            className={`${inputCls} h-14 text-lg`}
            aria-invalid={!!error?.fieldError('url')}
          />
          <FieldError message={error?.fieldError('url')} />
        </div>
        <button type="submit" disabled={busy || !url.trim()} className={buttonCls('primary', 'xl')}>
          {busy ? t('shorten.submitting') : t('shorten.submit')}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="text-sm font-medium text-slate-600 hover:text-navy"
        aria-expanded={advanced}
        data-tour="options"
      >
        {advanced ? t('shorten.hideAdvanced') : t('shorten.showAdvanced')}
      </button>

      {advanced && (
        <div className="grid gap-4 border-l border-line pl-4 sm:grid-cols-2">
          <div>
            <label htmlFor="alias" className="mb-1 block text-sm font-medium">
              {t('shorten.alias')}
            </label>
            <input
              id="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t('shorten.aliasPlaceholder')}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-500">{t('shorten.aliasHint')}</p>
            <FieldError message={error?.fieldError('alias')} />
          </div>
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium">
              {t('shorten.titleLabel')}
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('shorten.titlePlaceholder')}
              className={inputCls}
            />
            <FieldError message={error?.fieldError('title')} />
          </div>
          <div>
            <label htmlFor="tags" className="mb-1 block text-sm font-medium">
              {t('tags.label')}
            </label>
            <TagInput id="tags" value={tags} onChange={setTags} />
            <FieldError message={error?.fieldError('tags')} />
          </div>
          <div>
            <label htmlFor="startsAt" className="mb-1 block text-sm font-medium">
              {t('shorten.startsAt')}
            </label>
            <input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputCls}
            />
            <FieldError message={error?.fieldError('startsAt')} />
          </div>
          <div>
            <label htmlFor="expiresAt" className="mb-1 block text-sm font-medium">
              {t('shorten.expiresAt')}
            </label>
            <input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={inputCls}
            />
            <FieldError message={error?.fieldError('expiresAt')} />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={duplicates.length > 0}
        title={t('dup.title')}
        message={t('dup.message')}
        confirmLabel={t('dup.createNew')}
        busy={busy}
        onConfirm={async () => {
          setDuplicates([]);
          await create();
        }}
        onCancel={() => setDuplicates([])}
      >
        <ul className="mt-4 space-y-2">
          {duplicates.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-brand">{d.shortUrl}</div>
                <div className="text-xs text-slate-500">{fmt.dateTime(d.createdAt)}</div>
              </div>
              <button type="button" onClick={() => pickExisting(d)} className={buttonCls('dark', 'sm', 'shrink-0')}>
                {t('dup.useExisting')}
              </button>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </form>
  );
}
