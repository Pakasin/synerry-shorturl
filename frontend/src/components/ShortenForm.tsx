// นำเข้า state ของ React
import { useState, type FormEvent } from 'react';
// นำเข้าตัวแสดงแจ้งเตือน
import { toast } from 'sonner';
// นำเข้าตัวเรียก API และชนิดข้อมูล
import { api, ApiError, type Link } from '../api';
// นำเข้าตัวแปลงค่าวันเวลาจากช่องกรอก
import { fromLocalInput, useFormat } from '../format';
// นำเข้าภาษาและตัวแปลง error
import { useErrorText, useI18n } from '../i18n';
// นำเข้าช่องกรอกแท็กและกล่องยืนยัน
import { TagInput } from './TagInput';
import { ConfirmDialog } from './ui';

// class ของช่องกรอก ใช้ร่วมกันทุกช่อง
export const inputCls = 'w-full rounded-[10px] border border-slate-300 bg-surface px-3 py-2.5 outline-none focus:border-navy focus:ring-2 focus:ring-navy/15';

// ข้อความ error ใต้ช่องกรอก
export function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-brand">{message}</p> : null;
}

// ฟอร์มย่อลิงก์: กรอก URL (บังคับ) และตัวเลือกเพิ่มเติม (alias ชื่อเรียก แท็ก วันเริ่ม วันหมดอายุ)
export function ShortenForm({ onCreated }: { onCreated: (link: Link) => void }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error เป็นข้อความ
  const errorText = useErrorText();
  // ตัวจัดรูปแบบวันที่
  const fmt = useFormat();
  // URL ที่กรอก
  const [url, setUrl] = useState('');
  // alias ที่ตั้งเอง
  const [alias, setAlias] = useState('');
  // ชื่อเรียกลิงก์
  const [title, setTitle] = useState('');
  // แท็ก
  const [tags, setTags] = useState<string[]>([]);
  // วันเริ่มใช้งาน (ค่าจากช่อง datetime-local)
  const [startsAt, setStartsAt] = useState('');
  // วันหมดอายุ (ค่าจากช่อง datetime-local)
  const [expiresAt, setExpiresAt] = useState('');
  // แสดงตัวเลือกเพิ่มเติมหรือไม่
  const [advanced, setAdvanced] = useState(false);
  // กำลังส่งข้อมูล
  const [busy, setBusy] = useState(false);
  // error ล่าสุดจาก API ใช้แสดงใต้ช่องที่ผิด
  const [error, setError] = useState<ApiError | null>(null);
  // ลิงก์เดิมที่ชี้ไป URL เดียวกัน (มีค่า = เปิดกล่องถาม)
  const [duplicates, setDuplicates] = useState<Link[]>([]);

  // ล้างฟอร์มหลังสร้างหรือเลือกใช้ลิงก์เดิม
  const reset = () => {
    setUrl('');
    setAlias('');
    setTitle('');
    setTags([]);
    setStartsAt('');
    setExpiresAt('');
    setError(null);
  };

  // สร้างลิงก์จริง
  const create = async () => {
    // เริ่มส่ง
    setBusy(true);
    try {
      // เรียก API สร้างลิงก์ ส่งเฉพาะช่องที่กรอก
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
      // แจ้งหน้าหลักให้แสดงผลลัพธ์
      onCreated(r.link);
      // ไม่ต้องแจ้งเตือนมุมจอ เพราะหน้าหลักแสดงป้ายลิงก์พร้อมข้อความสำเร็จอยู่แล้ว
      // ล้างฟอร์ม
      reset();
    } catch (err) {
      // เก็บ error ไว้แสดงใต้ช่อง
      if (err instanceof ApiError) setError(err);
      // แจ้งเตือนข้อความรวม
      toast.error(errorText(err));
    } finally {
      // ส่งเสร็จแล้ว
      setBusy(false);
    }
  };

  // ส่งฟอร์ม: ถ้าไม่ได้ตั้ง alias ให้ตรวจก่อนว่าเคยย่อ URL นี้หรือยัง
  const submit = async (e: FormEvent) => {
    // ไม่ให้ browser โหลดหน้าใหม่
    e.preventDefault();
    // ล้าง error เดิม
    setError(null);
    // ถ้าตั้ง alias เอง แปลว่าตั้งใจสร้างลิงก์ใหม่ ข้ามการตรวจ
    if (!alias) {
      try {
        // ถามหาลิงก์เดิม
        const r = await api<{ items: Link[] }>(`/links/duplicates?url=${encodeURIComponent(url)}`);
        // ถ้ามี เปิดกล่องถามแล้วหยุดรอ
        if (r.items.length) {
          setDuplicates(r.items);
          return;
        }
      } catch {
        // ตรวจไม่ได้ก็ไม่เป็นไร สร้างต่อเลย
      }
    }
    // ไม่มีลิงก์ซ้ำ สร้างเลย
    await create();
  };

  // เลือกใช้ลิงก์เดิม
  const pickExisting = (link: Link) => {
    // ปิดกล่องถาม
    setDuplicates([]);
    // แสดงลิงก์เดิมเป็นผลลัพธ์
    onCreated(link);
    // ล้างฟอร์ม
    reset();
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {/* ช่อง URL และปุ่มย่อลิงก์ อยู่แถวเดียวกันบนจอใหญ่ */}
      <div className="flex flex-col gap-2 sm:flex-row" data-tour="url">
        <div className="flex-1">
          <label htmlFor="url" className="sr-only">{t('shorten.urlLabel')}</label>
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
        <button type="submit" disabled={busy || !url.trim()} className="h-14 rounded-[10px] bg-brand px-8 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
          {busy ? t('shorten.submitting') : t('shorten.submit')}
        </button>
      </div>

      {/* ปุ่มเปิดปิดตัวเลือกเพิ่มเติม */}
      <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-sm font-medium text-slate-600 hover:text-navy" aria-expanded={advanced} data-tour="options">
        {advanced ? t('shorten.hideAdvanced') : t('shorten.showAdvanced')}
      </button>

      {/* ตัวเลือกเพิ่มเติม */}
      {advanced && (
        <div className="grid gap-4 border-l border-line pl-4 sm:grid-cols-2">
          {/* alias */}
          <div>
            <label htmlFor="alias" className="mb-1 block text-sm font-medium">{t('shorten.alias')}</label>
            <input id="alias" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={t('shorten.aliasPlaceholder')} className={inputCls} />
            <p className="mt-1 text-xs text-slate-500">{t('shorten.aliasHint')}</p>
            <FieldError message={error?.fieldError('alias')} />
          </div>
          {/* ชื่อเรียก */}
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium">{t('shorten.titleLabel')}</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('shorten.titlePlaceholder')} className={inputCls} />
            <FieldError message={error?.fieldError('title')} />
          </div>
          {/* แท็ก */}
          <div>
            <label htmlFor="tags" className="mb-1 block text-sm font-medium">{t('tags.label')}</label>
            <TagInput id="tags" value={tags} onChange={setTags} />
            <FieldError message={error?.fieldError('tags')} />
          </div>
          {/* วันเริ่มใช้งาน */}
          <div>
            <label htmlFor="startsAt" className="mb-1 block text-sm font-medium">{t('shorten.startsAt')}</label>
            <input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
            <FieldError message={error?.fieldError('startsAt')} />
          </div>
          {/* วันหมดอายุ */}
          <div>
            <label htmlFor="expiresAt" className="mb-1 block text-sm font-medium">{t('shorten.expiresAt')}</label>
            <input id="expiresAt" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
            <FieldError message={error?.fieldError('expiresAt')} />
          </div>
        </div>
      )}

      {/* กล่องถามเมื่อเคยย่อ URL นี้แล้ว */}
      <ConfirmDialog
        open={duplicates.length > 0}
        title={t('dup.title')}
        message={t('dup.message')}
        confirmLabel={t('dup.createNew')}
        busy={busy}
        onConfirm={async () => {
          // ปิดกล่องแล้วสร้างลิงก์ใหม่ตามที่ผู้ใช้ยืนยัน
          setDuplicates([]);
          await create();
        }}
        onCancel={() => setDuplicates([])}
      >
        {/* รายการลิงก์เดิม กดปุ่มเพื่อใช้ลิงก์นั้น */}
        <ul className="mt-4 space-y-2">
          {duplicates.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2">
              <div className="min-w-0">
                <div className="truncate font-semibold text-brand">{d.shortUrl}</div>
                <div className="text-xs text-slate-500">{fmt.dateTime(d.createdAt)}</div>
              </div>
              <button type="button" onClick={() => pickExisting(d)} className="shrink-0 rounded-[10px] bg-navy px-3 py-1.5 text-sm font-semibold text-surface hover:opacity-90">
                {t('dup.useExisting')}
              </button>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </form>
  );
}
