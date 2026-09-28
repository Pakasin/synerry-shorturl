import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { LinkStatus } from '../api';
import { useFormat } from '../format';
import { useI18n } from '../i18n';
import { buttonCls, chipCls } from './styles';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</section>;
}

export function CopyButton({
  text,
  className = '',
  primary = false,
}: {
  text: string;
  className?: string;
  primary?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t('common.copiedToast'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={buttonCls(primary ? 'dark' : 'outline', 'sm', `print:hidden ${className}`)}
    >
      {copied ? t('common.copied') : t('common.copy')}
    </button>
  );
}

export function StatusBadge({ status }: { status: LinkStatus }) {
  const { t } = useI18n();
  const map = {
    active: { cls: 'bg-green-50 text-green-800 ring-green-600/30', dot: 'bg-green-600' },
    disabled: { cls: 'bg-slate-100 text-slate-700 ring-slate-400/40', dot: 'bg-slate-500' },
    expired: { cls: 'bg-amber-50 text-amber-800 ring-amber-600/30', dot: 'bg-amber-500' },
    scheduled: { cls: 'bg-sky-50 text-sky-800 ring-sky-600/30', dot: 'bg-sky-500' },
    locked: { cls: 'bg-red-50 text-brand ring-brand/40', dot: 'bg-brand' },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${map.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
      #{tag}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('tags.remove', { tag })}
          className="grid h-4 w-4 place-items-center rounded text-slate-500 hover:text-brand"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  useEffect(() => {
    if (!props.open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancelRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open]);
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={props.onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title" className="text-lg font-bold">
          {props.title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{props.message}</div>
        {props.children}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} onClick={props.onCancel} className={buttonCls('outline', 'md')}>
            {props.cancelLabel ?? t('common.cancel')}
          </button>
          <button onClick={props.onConfirm} disabled={props.busy} className={buttonCls('primary', 'md')}>
            {props.busy ? t('common.processing') : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StatStrip({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-line py-5 sm:flex sm:flex-wrap sm:gap-x-12">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dd className="tabular text-3xl font-bold leading-none">{it.value}</dd>
          <dt className="mt-2 text-sm text-slate-600">{it.label}</dt>
          {it.hint && <p className="text-xs text-slate-500">{it.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
    >
      <span>{message}</span>
      <button type="button" onClick={onRetry} className={buttonCls()}>
        {t('common.retry')}
      </button>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-brand">{message}</p> : null;
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={chipCls(active)}>
      {children}
    </button>
  );
}

export function Pager(props: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
      <span className="text-slate-500">
        {props.loading
          ? t('common.loading')
          : t('history.summary', { total: fmt.number(props.total), page: props.page, pages })}
      </span>
      <div className="flex gap-2">
        <button
          disabled={props.page <= 1}
          onClick={() => props.onPage(props.page - 1)}
          className={buttonCls('outline', 'sm')}
        >
          {t('history.prev')}
        </button>
        <button
          disabled={props.page >= pages}
          onClick={() => props.onPage(props.page + 1)}
          className={buttonCls('outline', 'sm')}
        >
          {t('history.next')}
        </button>
      </div>
    </div>
  );
}
