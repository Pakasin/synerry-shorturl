import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, type MessageKey } from '../i18n';
import { buttonCls } from './styles';

export type TourStep = { id: string; target?: string };

const PAD = 6;
const POPOVER_W = 360;
const EDGE = 16;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Tour({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [boxH, setBoxH] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const findTarget = useCallback(() => {
    if (!step.target) return null;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return null;
    return el;
  }, [step.target]);

  const measure = useCallback(() => {
    const el = findTarget();
    setRect(el ? el.getBoundingClientRect() : null);
  }, [findTarget]);

  useLayoutEffect(() => {
    const el = findTarget();
    el?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    measure();
    const timer = setTimeout(measure, 350);
    return () => clearTimeout(timer);
  }, [findTarget, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useLayoutEffect(() => {
    setBoxH(boxRef.current?.offsetHeight ?? 0);
    primaryRef.current?.focus();
  }, [index, t]);

  const next = useCallback(() => (last ? onFinish() : setIndex((i) => i + 1)), [last, onFinish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onFinish]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw < 640;
  const width = Math.min(POPOVER_W, vw - EDGE * 2);

  let style: CSSProperties;
  if (narrow) {
    style = { left: EDGE, right: EDGE, bottom: EDGE };
  } else if (!rect) {
    style = { left: (vw - width) / 2, top: Math.max(EDGE, (vh - boxH) / 2), width };
  } else {
    const below = rect.bottom + PAD + 12;
    const top = below + boxH + EDGE <= vh ? below : Math.max(EDGE, rect.top - PAD - 12 - boxH);
    const left = Math.min(Math.max(EDGE, rect.left), vw - width - EDGE);
    style = { left, top, width };
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      <div className={`absolute inset-0 ${rect ? '' : 'bg-black/60'}`} />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand transition-all duration-200 ease-out motion-reduce:transition-none"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)',
          }}
        />
      )}

      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute rounded-2xl bg-surface p-5 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.45)]"
        style={style}
      >
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span className="tabular">{t('tour.step', { n: index + 1, total: steps.length })}</span>
          <span className="flex gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-brand' : 'w-1.5 bg-slate-300'}`}
              />
            ))}
          </span>
        </div>
        <h2 id="tour-title" className="text-lg font-bold leading-snug">
          {t(`tour.${step.id}.title` as MessageKey)}
        </h2>
        <p id="tour-body" className="mt-2 text-slate-600">
          {t(`tour.${step.id}.body` as MessageKey)}
        </p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onFinish}
            className={buttonCls('ghost', 'row', 'text-slate-500 hover:text-navy')}
          >
            {t('tour.skip')}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={back} className={buttonCls('outline', 'sm')}>
                {t('tour.back')}
              </button>
            )}
            <button ref={primaryRef} type="button" onClick={next} className={buttonCls('primary', 'md')}>
              {last ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
