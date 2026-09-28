// นำเข้า state และชนิดข้อมูลของ React
import { useEffect, useRef, useState, type ReactNode } from 'react';
// นำเข้าตัวแสดงแจ้งเตือนมุมจอ
import { toast } from 'sonner';
// นำเข้าชนิดสถานะลิงก์
import type { LinkStatus } from '../api';
// นำเข้าฟังก์ชันแปล
import { useI18n } from '../i18n';

// กล่องพื้น Paper ขอบบาง ไม่มีเงา ใช้เฉพาะเนื้อหาที่ต้องมีกรอบจริงๆ (ตาราง กราฟ)
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</section>;
}

// ปุ่มคัดลอกข้อความ เปลี่ยนเป็น "คัดลอกแล้ว" ชั่วครู่หลังกด
export function CopyButton({ text, className = '', primary = false }: { text: string; className?: string; primary?: boolean }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // สถานะว่าเพิ่งคัดลอกไป
  const [copied, setCopied] = useState(false);
  // คัดลอกลง clipboard
  const copy = async () => {
    try {
      // ใช้ clipboard API ของ browser
      await navigator.clipboard.writeText(text);
      // เปลี่ยนข้อความปุ่ม
      setCopied(true);
      // แจ้งเตือน
      toast.success(t('common.copiedToast'));
      // 1.5 วินาทีแล้วเปลี่ยนกลับ
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // บาง browser ไม่อนุญาต ให้บอกผู้ใช้คัดลอกเอง
      toast.error(t('common.copyFailed'));
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      // ปุ่มหลักใช้พื้นกรมท่า ปุ่มธรรมดาใช้ขอบบาง
      className={`rounded-[10px] px-3 py-1.5 text-sm font-medium print:hidden ${primary ? 'bg-navy text-surface hover:opacity-90' : 'border border-line hover:bg-mist'} ${className}`}
    >
      {copied ? t('common.copied') : t('common.copy')}
    </button>
  );
}

// ป้ายสถานะลิงก์ มีทั้งจุดสีและข้อความ (ไม่ใช้สีอย่างเดียว เพื่อคนตาบอดสี)
export function StatusBadge({ status }: { status: LinkStatus }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // สีของแต่ละสถานะ
  const map = {
    active: { cls: 'bg-green-50 text-green-800 ring-green-600/30', dot: 'bg-green-600' },
    disabled: { cls: 'bg-slate-100 text-slate-700 ring-slate-400/40', dot: 'bg-slate-500' },
    expired: { cls: 'bg-amber-50 text-amber-800 ring-amber-600/30', dot: 'bg-amber-500' },
    scheduled: { cls: 'bg-sky-50 text-sky-800 ring-sky-600/30', dot: 'bg-sky-500' },
    locked: { cls: 'bg-red-50 text-brand ring-brand/40', dot: 'bg-brand' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${map.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}

// ป้ายแท็ก
export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
      #{tag}
      {/* ปุ่มลบแท็ก แสดงเฉพาะตอนแก้ไขได้ */}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={t('tags.remove', { tag })} className="grid h-4 w-4 place-items-center rounded text-slate-500 hover:text-brand">
          {/* ไอคอนกากบาทวาดด้วย SVG เส้นหนาเท่ากันทั้งเว็บ */}
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

// กล่องยืนยันก่อนทำสิ่งที่ย้อนกลับไม่ได้ (ใช้แทน window.confirm ที่หน้าตาต่างกันแต่ละ browser)
export function ConfirmDialog(props: {
  // เปิดอยู่หรือไม่
  open: boolean;
  // หัวข้อ
  title: string;
  // รายละเอียด
  message: ReactNode;
  // ข้อความปุ่มยืนยัน
  confirmLabel: string;
  // ข้อความปุ่มยกเลิก (ถ้าไม่ระบุใช้ "ยกเลิก")
  cancelLabel?: string;
  // กำลังทำงานอยู่ (ปิดปุ่มกันกดซ้ำ)
  busy?: boolean;
  // เมื่อกดยืนยัน
  onConfirm: () => void;
  // เมื่อกดยกเลิก
  onCancel: () => void;
  // เนื้อหาเพิ่มเติมใต้ข้อความ
  children?: ReactNode;
}) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // อ้างอิงปุ่มยกเลิก เพื่อให้ focus อยู่ที่ปุ่มปลอดภัยก่อน
  const cancelRef = useRef<HTMLButtonElement>(null);
  // เก็บฟังก์ชันยกเลิกล่าสุดไว้ใน ref เพื่อไม่ให้ effect รันใหม่ทุกครั้งที่ parent render
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  // เมื่อเปิด ให้ focus ที่ปุ่มยกเลิก และกด Esc เพื่อปิดได้
  useEffect(() => {
    // ไม่ได้เปิดอยู่ ไม่ต้องทำอะไร
    if (!props.open) return;
    // focus ปุ่มยกเลิก
    cancelRef.current?.focus();
    // ฟังการกด Esc
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancelRef.current();
    // เริ่มฟัง
    window.addEventListener('keydown', onKey);
    // เลิกฟังเมื่อปิด
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open]);
  // ปิดอยู่ ไม่ต้องแสดง
  if (!props.open) return null;
  return (
    // ฉากหลังมืด กดที่ฉากหลังเพื่อยกเลิก
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={props.onCancel}>
      {/* กล่องยืนยัน กดข้างในไม่ปิด */}
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.35)]" onClick={(e) => e.stopPropagation()}>
        <h2 id="dialog-title" className="text-lg font-bold">{props.title}</h2>
        <div className="mt-2 text-sm text-slate-600">{props.message}</div>
        {props.children}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} onClick={props.onCancel} className="rounded-[10px] border border-line px-4 py-2 text-sm hover:bg-mist">
            {props.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            onClick={props.onConfirm}
            disabled={props.busy}
            className="rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {props.busy ? t('common.processing') : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// แถบตัวเลขสรุป: ตัวเลขใหญ่เรียงเป็นแถวเดียว คั่นด้วยเส้นบน-ล่าง แทนการหั่นเป็นการ์ดหลายใบ
export function StatStrip({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-line py-5 sm:flex sm:flex-wrap sm:gap-x-12">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          {/* ตัวเลข */}
          <dd className="tabular text-3xl font-bold leading-none">{it.value}</dd>
          {/* ชื่อ */}
          <dt className="mt-2 text-sm text-slate-600">{it.label}</dt>
          {/* คำอธิบายเพิ่มเติม */}
          {it.hint && <p className="text-xs text-slate-500">{it.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

// กล่องแจ้งว่าโหลดข้อมูลไม่สำเร็จ บอกปัญหาและมีปุ่มลองใหม่ (แทนการปล่อยหน้าว่าง)
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="rounded-[10px] border border-line px-3 py-1.5 font-medium hover:bg-mist">
        {t('common.retry')}
      </button>
    </div>
  );
}

// ข้อความแจ้งเตือนแบบแถบ ใช้ตอนสถิติยังไม่พร้อม
export function Notice({ children }: { children: ReactNode }) {
  return <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{children}</div>;
}
