// นำเข้า state และ effect ของ React
import { useCallback, useEffect, useState } from 'react';
// นำเข้าลิงก์ภายในเว็บ
import { Link as RouterLink } from 'react-router';
// นำเข้าตัวแสดงแจ้งเตือน
import { toast } from 'sonner';
// นำเข้าตัวเรียก API และชนิดข้อมูล
import { api, type LinkList, type LinkWithClicks } from '../api';
// นำเข้าตัวจัดรูปแบบ
import { useFormat } from '../format';
// นำเข้าภาษาและตัวแปลง error
import { useErrorText, useI18n } from '../i18n';
// นำเข้า component พื้นฐาน
import { Card, ConfirmDialog, CopyButton, LoadError, Notice, StatusBadge, TagChip } from '../components/ui';

// จำนวนลิงก์ต่อหน้า
const PAGE_SIZE = 10;
// จำนวนวันที่ลิงก์อยู่ในถังขยะก่อนถูกลบถาวร (ตรงกับ gateway)
const TRASH_DAYS = 30;

// class ของปุ่มกรองแท็ก
const chipCls = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm font-medium ring-1 ${active ? 'bg-navy text-surface ring-navy' : 'bg-surface text-slate-600 ring-line hover:bg-mist'}`;

// หน้าประวัติลิงก์: ค้นหา กรองแท็ก แบ่งหน้า ดูยอดคลิก เปิดปิด ย้ายไปถังขยะ และดาวน์โหลด
export function History() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ข้อความในช่องค้นหา
  const [search, setSearch] = useState('');
  // คำค้นที่ใช้จริง (หน่วงเวลาหลังพิมพ์เสร็จ ไม่เรียก API ทุกตัวอักษร)
  const [query, setQuery] = useState('');
  // แท็กที่เลือกกรอง (ว่าง = ทั้งหมด)
  const [tag, setTag] = useState('');
  // รายชื่อแท็กทั้งหมดของผู้ใช้
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  // หน้าปัจจุบัน
  const [page, setPage] = useState(1);
  // ข้อมูลที่โหลดมา
  const [data, setData] = useState<LinkList | null>(null);
  // กำลังโหลด
  const [loading, setLoading] = useState(true);
  // ลิงก์ที่กำลังจะย้ายไปถังขยะ (เปิดกล่องยืนยัน)
  const [toTrash, setToTrash] = useState<LinkWithClicks | null>(null);
  // กำลังย้าย
  const [trashing, setTrashing] = useState(false);
  // error ของการโหลดครั้งล่าสุด (มีค่า = แสดงกล่องลองใหม่แทนตาราง)
  const [loadError, setLoadError] = useState<string | null>(null);

  // หน่วงเวลา 300ms หลังหยุดพิมพ์ แล้วค่อยค้นหา และกลับไปหน้าแรก
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    // ถ้าพิมพ์ต่อก่อนครบเวลา ยกเลิกตัวจับเวลาเดิม
    return () => clearTimeout(timer);
  }, [search]);

  // โหลดรายชื่อแท็ก
  const loadTags = useCallback(() => {
    api<{ tags: { name: string; count: number }[] }>('/links/tags')
      .then((r) => setTags(r.tags))
      .catch(() => setTags([]));
  }, []);

  // โหลดรายการตามคำค้น แท็ก และหน้า
  const load = useCallback(async () => {
    // เริ่มโหลด
    setLoading(true);
    try {
      // สร้าง query string
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      // ใส่คำค้นถ้ามี
      if (query) params.set('q', query);
      // ใส่แท็กถ้าเลือก
      if (tag) params.set('tag', tag);
      // เรียก API
      setData(await api<LinkList>(`/links?${params}`));
      // โหลดสำเร็จ ล้าง error เดิม
      setLoadError(null);
    } catch (err) {
      // เก็บข้อความไว้แสดงในหน้า พร้อมปุ่มลองใหม่
      setLoadError(errorText(err));
    } finally {
      // โหลดเสร็จ
      setLoading(false);
    }
  }, [page, query, tag, errorText]);

  // โหลดใหม่ทุกครั้งที่หน้า คำค้น หรือแท็กเปลี่ยน
  useEffect(() => {
    load();
  }, [load]);

  // โหลดแท็กครั้งแรก
  useEffect(loadTags, [loadTags]);

  // เลือกแท็กกรอง แล้วกลับไปหน้าแรก
  const pickTag = (name: string) => {
    setTag(name);
    setPage(1);
  };

  // เปิดหรือปิดการใช้งานลิงก์
  const toggleActive = async (link: LinkWithClicks) => {
    try {
      // สลับสถานะ
      await api(`/links/${link.id}`, { method: 'PATCH', body: { isActive: !link.isActive } });
      // แจ้งผล
      toast.success(link.isActive ? t('history.disabledToast') : t('history.enabledToast'));
      // โหลดรายการใหม่
      load();
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    }
  };

  // ย้ายลิงก์ไปถังขยะหลังยืนยัน
  const confirmTrash = async () => {
    // ไม่มีลิงก์ที่เลือก ไม่ต้องทำ
    if (!toTrash) return;
    // เริ่มย้าย
    setTrashing(true);
    try {
      // เรียก API ลบ (ย้ายไปถังขยะ)
      await api(`/links/${toTrash.id}`, { method: 'DELETE' });
      // แจ้งผล
      toast.success(t('history.trashedToast'));
      // ปิดกล่องยืนยัน
      setToTrash(null);
      // โหลดแท็กใหม่ (จำนวนอาจเปลี่ยน)
      loadTags();
      // ถ้าย้ายตัวสุดท้ายของหน้า ให้ถอยไปหน้าก่อน ไม่งั้นโหลดหน้าเดิมใหม่
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    } finally {
      // ย้ายเสร็จ
      setTrashing(false);
    }
  };

  // จำนวนหน้าทั้งหมด
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  // กำลังกรองอยู่หรือไม่ (ใช้เลือกข้อความตอนไม่มีผลลัพธ์)
  const filtering = !!query || !!tag;

  return (
    <div className="space-y-4">
      {/* หัวข้อ ช่องค้นหา และปุ่มดาวน์โหลด */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{t('history.title')}</h1>
          <p className="text-sm text-slate-500">{t('history.subtitle')}</p>
        </div>
        {/* ช่องค้นหา */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('history.search')}
          aria-label={t('history.search')}
          className="w-full rounded-[10px] border border-slate-300 bg-surface px-3 py-2 outline-none focus:border-navy focus:ring-2 focus:ring-navy/15 lg:w-72"
        />
        {/* ดาวน์โหลด: เปิด URL ตรงๆ browser จะดาวน์โหลดไฟล์ให้ (cookie ติดไปด้วยเพราะโดเมนเดียวกัน) */}
        <div className="flex gap-2">
          <a href="/api/links/export.csv" className="flex-1 whitespace-nowrap rounded-[10px] border border-line bg-surface px-4 py-2 text-center text-sm font-medium hover:bg-mist">
            {t('export.csv')}
          </a>
          <a href="/api/links/export.xlsx" className="flex-1 whitespace-nowrap rounded-[10px] border border-line bg-surface px-4 py-2 text-center text-sm font-medium hover:bg-mist">
            {t('export.xlsx')}
          </a>
        </div>
      </div>

      {/* ปุ่มกรองแท็ก แสดงเมื่อมีแท็กอย่างน้อยหนึ่งตัว */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('tags.label')}>
          <button type="button" onClick={() => pickTag('')} aria-pressed={!tag} className={chipCls(!tag)}>
            {t('tags.all')}
          </button>
          {tags.map((tg) => (
            <button key={tg.name} type="button" onClick={() => pickTag(tg.name)} aria-pressed={tag === tg.name} className={chipCls(tag === tg.name)}>
              #{tg.name} <span className="tabular opacity-75">{tg.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* แจ้งเมื่อระบบสถิติไม่พร้อม */}
      {data && !data.analyticsAvailable && <Notice>{t('history.analyticsDown')}</Notice>}

      {/* โหลดไม่สำเร็จ: บอกปัญหาและให้ลองใหม่ */}
      {loadError && <LoadError message={loadError} onRetry={load} />}

      <Card className="overflow-hidden p-0">
        {/* ตารางเลื่อนแนวนอนได้บนจอเล็ก */}
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
              {/* แถวข้อมูล */}
              {data?.items.map((l) => (
                <tr key={l.id} className="align-top hover:bg-slate-50/60">
                  {/* ชื่อ URL ต้นฉบับ และแท็ก ตัดให้พอดีช่อง ชี้แล้วเห็นเต็ม */}
                  <td className="max-w-[280px] px-4 py-3">
                    <div className="truncate font-medium" title={l.title ?? l.originalUrl}>{l.title || t('common.untitled')}</div>
                    <div className="truncate text-slate-500" title={l.originalUrl}>{l.originalUrl}</div>
                    {l.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.tags.map((tg) => <TagChip key={tg} tag={tg} />)}
                      </div>
                    )}
                  </td>
                  {/* ลิงก์สั้นพร้อมปุ่มคัดลอก */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a href={l.shortUrl} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">/{l.shortCode}</a>
                      <CopyButton text={l.shortUrl} className="px-2 py-1 text-xs" />
                    </div>
                  </td>
                  {/* จำนวนคลิก */}
                  <td className="tabular px-4 py-3 text-right font-semibold">{fmt.number(l.clicks)}</td>
                  {/* สถานะ */}
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  {/* วันที่สร้าง */}
                  <td className="tabular whitespace-nowrap px-4 py-3 text-slate-500">{fmt.dateTime(l.createdAt)}</td>
                  {/* ปุ่มจัดการ */}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <RouterLink to={`/links/${l.id}`} className="inline-block rounded-md px-2 py-1.5 font-medium text-navy hover:bg-mist">{t('history.statsQr')}</RouterLink>
                    {/* ลิงก์ที่ผู้ดูแลระงับ ไม่มีปุ่มเปิดปิด */}
                    {!l.lockedAt && (
                      <button onClick={() => toggleActive(l)} className="rounded-md px-2 py-1.5 font-medium text-slate-600 hover:bg-mist">
                        {l.isActive ? t('history.disable') : t('history.enable')}
                      </button>
                    )}
                    <button onClick={() => setToTrash(l)} className="rounded-md px-2 py-1.5 font-medium text-brand hover:bg-red-50">{t('history.delete')}</button>
                  </td>
                </tr>
              ))}
              {/* ไม่มีข้อมูล */}
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
        {/* แบ่งหน้า */}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
          <span className="text-slate-500">
            {loading ? t('common.loading') : t('history.summary', { total: fmt.number(data?.total ?? 0), page, pages: totalPages })}
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-[10px] border border-line px-3 py-1 hover:bg-mist disabled:opacity-40">{t('history.prev')}</button>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-[10px] border border-line px-3 py-1 hover:bg-mist disabled:opacity-40">{t('history.next')}</button>
          </div>
        </div>
      </Card>

      {/* กล่องยืนยันการย้ายไปถังขยะ */}
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
