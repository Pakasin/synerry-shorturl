// นำเข้า state และ effect ของ React
import { useCallback, useEffect, useState } from 'react';
// นำเข้าตัวแสดงแจ้งเตือน
import { toast } from 'sonner';
// นำเข้าตัวเรียก API และชนิดข้อมูล
import { api, type Link } from '../api';
// นำเข้าตัวจัดรูปแบบ
import { useFormat } from '../format';
// นำเข้าภาษาและตัวแปลง error
import { useErrorText, useI18n } from '../i18n';
// นำเข้า component พื้นฐาน
import { Card, ConfirmDialog } from '../components/ui';

// หน้าถังขยะ: ดูลิงก์ที่ลบ กู้คืน หรือลบถาวร
export function Trash() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ลิงก์ในถังขยะ
  const [items, setItems] = useState<Link[] | null>(null);
  // จำนวนวันที่เก็บ (ได้จาก gateway)
  const [retention, setRetention] = useState(30);
  // ลิงก์ที่กำลังจะลบถาวร
  const [toDelete, setToDelete] = useState<Link | null>(null);
  // กำลังทำงาน
  const [busy, setBusy] = useState(false);

  // โหลดรายการ (gateway จะลบถาวรลิงก์ที่หมดระยะเก็บไปพร้อมกัน)
  const load = useCallback(async () => {
    try {
      // เรียก API
      const r = await api<{ items: Link[]; retentionDays: number }>('/links/trash');
      // ตั้งข้อมูล
      setItems(r.items);
      setRetention(r.retentionDays);
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    }
  }, [errorText]);

  // โหลดครั้งแรก
  useEffect(() => {
    load();
  }, [load]);

  // กู้คืนลิงก์
  const restore = async (link: Link) => {
    try {
      // เรียก API กู้คืน
      await api(`/links/${link.id}/restore`, { method: 'POST' });
      // แจ้งผล
      toast.success(t('trash.restoredToast'));
      // โหลดใหม่
      load();
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    }
  };

  // ลบถาวรหลังยืนยัน
  const deleteForever = async () => {
    // ไม่มีลิงก์ที่เลือก
    if (!toDelete) return;
    // เริ่มลบ
    setBusy(true);
    try {
      // เรียก API ลบถาวร
      await api(`/links/${toDelete.id}/permanent`, { method: 'DELETE' });
      // แจ้งผล
      toast.success(t('trash.deletedToast'));
      // ปิดกล่อง
      setToDelete(null);
      // โหลดใหม่
      load();
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    } finally {
      // ลบเสร็จ
      setBusy(false);
    }
  };

  // จำนวนวันที่เหลือก่อนถูกลบถาวร
  const daysLeft = (deletedAt: string | null) =>
    deletedAt ? Math.max(0, retention - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000)) : retention;

  return (
    <div className="space-y-4">
      {/* หัวข้อและคำอธิบาย */}
      <div>
        <h1 className="text-2xl font-bold">{t('trash.title')}</h1>
        <p className="text-sm text-slate-500">{t('trash.subtitle', { days: retention })}</p>
      </div>

      <Card className="p-0">
        {/* ยังโหลดไม่เสร็จ */}
        {items === null && <p className="px-5 py-8 text-center text-slate-500">{t('common.loading')}</p>}
        {/* ถังขยะว่าง */}
        {items?.length === 0 && <p className="px-5 py-8 text-center text-slate-500">{t('trash.empty')}</p>}
        {/* รายการ */}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                {/* ข้อมูลลิงก์ */}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.title || t('common.untitled')}</div>
                  <div className="truncate text-sm text-slate-500"><span className="font-medium text-slate-700">/{l.shortCode}</span> {t('shorten.goesTo')} {l.originalUrl}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {t('trash.deletedAt')} {fmt.dateTime(l.deletedAt)}, <strong>{t('trash.daysLeft', { n: daysLeft(l.deletedAt) })}</strong>
                  </div>
                </div>
                {/* ปุ่มกู้คืนและลบถาวร */}
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => restore(l)} className="rounded-[10px] bg-navy px-3 py-1.5 text-sm font-semibold text-surface hover:opacity-90">
                    {t('trash.restore')}
                  </button>
                  <button onClick={() => setToDelete(l)} className="rounded-[10px] border border-brand/40 px-3 py-1.5 text-sm font-medium text-brand hover:bg-red-50">
                    {t('trash.deleteForever')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* กล่องยืนยันการลบถาวร */}
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
