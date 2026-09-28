// นำเข้า state และ effect ของ React
import { useCallback, useEffect, useState, type FormEvent } from 'react';
// นำเข้าตัวอ่าน parameter จาก URL ลิงก์ภายใน และตัวเปลี่ยนหน้า
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
// นำเข้าตัวแสดงแจ้งเตือน
import { toast } from 'sonner';
// นำเข้าตัวเรียก API และชนิดข้อมูล
import { api, ApiError, type Link, type LinkStats } from '../api';
// นำเข้าตัวจัดรูปแบบและตัวแปลงวันเวลา
import { fromLocalInput, toLocalInput, useFormat } from '../format';
// นำเข้าภาษาและตัวแปลง error
import { useErrorText, useI18n } from '../i18n';
// นำเข้า component
import { LinkTag, tagButton } from '../components/LinkTag';
import { Brand } from '../components/Layout';
import { BreakdownBars, DailyClicksChart } from '../components/charts';
import { CountryMap } from '../components/CountryMap';
import { TagInput } from '../components/TagInput';
import { inputCls } from '../components/ShortenForm';
import { Card, ConfirmDialog, LoadError, StatStrip, TagChip } from '../components/ui';

// ช่วงเวลาที่เลือกดูสถิติได้
const RANGES = [7, 30, 90] as const;
// จำนวนวันที่ลิงก์อยู่ในถังขยะ (ตรงกับ gateway)
const TRASH_DAYS = 30;

// หน้ารายละเอียดลิงก์: ข้อมูลลิงก์ QR แก้ไข และสถิติการคลิก (พิมพ์เป็นรายงาน PDF ได้)
export function LinkDetail() {
  // รหัสลิงก์จาก URL
  const { id } = useParams();
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ตัวเปลี่ยนหน้า
  const navigate = useNavigate();
  // ข้อมูลลิงก์
  const [link, setLink] = useState<Link | null>(null);
  // ไม่พบลิงก์
  const [notFound, setNotFound] = useState(false);
  // สถิติ
  const [stats, setStats] = useState<LinkStats | null>(null);
  // ระบบสถิติไม่พร้อม
  const [statsDown, setStatsDown] = useState(false);
  // ช่วงวันที่เลือก
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  // ค่าในฟอร์มแก้ไข
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  // กำลังบันทึก
  const [saving, setSaving] = useState(false);
  // เปิดกล่องยืนยันการย้ายไปถังขยะ
  const [confirmTrash, setConfirmTrash] = useState(false);

  // ตั้งข้อมูลลิงก์และค่าเริ่มต้นของฟอร์ม
  const applyLink = (l: Link) => {
    setLink(l);
    setTitle(l.title ?? '');
    setTags(l.tags);
    setStartsAt(toLocalInput(l.startsAt));
    setExpiresAt(toLocalInput(l.expiresAt));
  };

  // โหลดข้อมูลลิงก์ครั้งแรก
  useEffect(() => {
    api<{ link: Link }>(`/links/${id}`)
      // เจอ ตั้งข้อมูล
      .then((r) => applyLink(r.link))
      // ไม่เจอ (หรือไม่ใช่ของเรา) แสดงหน้าไม่พบ
      .catch((err) => (err instanceof ApiError && err.status === 404 ? setNotFound(true) : toast.error(errorText(err))));
  }, [id, errorText]);

  // โหลดสถิติตามช่วงวันที่เลือก
  const loadStats = useCallback(async () => {
    try {
      // เรียก API สถิติ
      const r = await api<{ stats: LinkStats }>(`/links/${id}/stats?days=${days}`);
      // ตั้งข้อมูล
      setStats(r.stats);
      // ระบบสถิติพร้อม
      setStatsDown(false);
    } catch {
      // โหลดสถิติไม่ได้ (ระบบสถิติไม่พร้อม หรือเชื่อมต่อไม่ได้) แสดงข้อความแทนกราฟ ไม่ปล่อยให้ว่างเงียบๆ
      setStatsDown(true);
    }
  }, [id, days]);

  // โหลดสถิติใหม่เมื่อเปลี่ยนช่วงวัน
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // บันทึกการแก้ไข
  const save = async (changes: Record<string, unknown>, message: string) => {
    // เริ่มบันทึก
    setSaving(true);
    try {
      // เรียก API แก้ไข
      const r = await api<{ link: Link }>(`/links/${id}`, { method: 'PATCH', body: changes });
      // อัปเดตข้อมูลบนหน้า
      applyLink(r.link);
      // แจ้งผล
      toast.success(message);
    } catch (err) {
      // แจ้ง error พร้อมรายละเอียดช่องที่ผิด (เช่น วันหมดอายุเป็นอดีต)
      toast.error(err instanceof ApiError && err.fields[0] ? `${errorText(err)} (${err.fields[0].field}: ${err.fields[0].message})` : errorText(err));
    } finally {
      // บันทึกเสร็จ
      setSaving(false);
    }
  };

  // ส่งฟอร์มแก้ไข
  const onSubmit = (e: FormEvent) => {
    // ไม่ให้โหลดหน้าใหม่
    e.preventDefault();
    // บันทึกทุกช่อง (ค่าว่าง = ลบค่า)
    save({ title: title || null, tags, startsAt: fromLocalInput(startsAt), expiresAt: fromLocalInput(expiresAt) }, t('detail.saved'));
  };

  // ย้ายไปถังขยะแล้วกลับไปหน้าประวัติ
  const moveToTrash = async () => {
    try {
      // เรียก API ลบ (ย้ายไปถังขยะ)
      await api(`/links/${id}`, { method: 'DELETE' });
      // แจ้งผล
      toast.success(t('history.trashedToast'));
      // กลับหน้าประวัติ
      navigate('/links', { replace: true });
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    }
  };

  // ไม่พบลิงก์
  if (notFound) {
    return (
      <Card className="text-center">
        <h1 className="text-xl font-bold">{t('detail.notFound')}</h1>
        <p className="mt-2 text-slate-500">{t('detail.notFoundHint')}</p>
        <RouterLink to="/links" className="mt-4 inline-block font-semibold text-brand hover:underline">{t('detail.back')}</RouterLink>
      </Card>
    );
  }

  // ยังโหลดไม่เสร็จ
  if (!link) return <p className="text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-8">
      {/* หัวรายงาน แสดงเฉพาะตอนพิมพ์ */}
      <div className="hidden border-b-2 border-brand pb-3 print:block">
        <Brand />
        <div className="mt-1 text-sm">{t('detail.reportOf')}, {t('detail.printedAt', { date: fmt.dateTime(new Date().toISOString()) })}</div>
      </div>

      {/* ลิงก์ย้อนกลับและปุ่มพิมพ์ (ไม่พิมพ์) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <RouterLink to="/links" className="text-sm font-medium text-slate-500 hover:text-navy">{t('detail.back')}</RouterLink>
        {/* ใช้ตัวพิมพ์ของ browser: เลือก "Save as PDF" ได้ และแสดงภาษาไทยถูกต้องเพราะใช้ฟอนต์ในหน้าเว็บ */}
        <button onClick={() => window.print()} className={tagButton}>
          {t('detail.print')}
        </button>
      </div>

      {/* หัวข้อ: ชื่อเรียก แท็ก และวันที่ */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{link.title || t('detail.untitled')}</h1>
        {/* แท็ก */}
        {link.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {link.tags.map((tg) => <TagChip key={tg} tag={tg} />)}
          </div>
        )}
        {/* วันที่ แยกเป็นช่วงๆ ไม่ใช้เครื่องหมายคั่น */}
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
          <span>{t('detail.createdAt', { date: fmt.dateTime(link.createdAt) })}</span>
          {link.startsAt && <span>{t('detail.startsAt', { date: fmt.dateTime(link.startsAt) })}</span>}
          {link.expiresAt && <span>{t('detail.expiresAt', { date: fmt.dateTime(link.expiresAt) })}</span>}
        </p>
      </header>

      {/* ลิงก์ถูกผู้ดูแลระงับ: บอกเหตุผลและสิ่งที่ทำได้ */}
      {link.lockedAt && (
        <div role="alert" className="max-w-3xl rounded-xl border border-brand/40 bg-red-50 px-5 py-4">
          <p className="font-semibold text-brand">{t('detail.lockedTitle')}</p>
          {link.lockReason && <p className="mt-1">{t('detail.lockedReason', { reason: link.lockReason })}</p>}
          <p className="mt-1 text-sm text-slate-600">{t('detail.lockedHint')}</p>
        </div>
      )}

      {/* ป้ายลิงก์: QR ลิงก์สั้น และปุ่มดาวน์โหลด */}
      <div className="max-w-3xl">
        <LinkTag link={link} showTitle={false} />
      </div>

      {/* ส่วนแก้ไข พับไว้ก่อน เพราะส่วนใหญ่คนเปิดหน้านี้มาดูสถิติ (ไม่พิมพ์) */}
      <details className="max-w-3xl rounded-xl border border-line bg-surface print:hidden">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 font-semibold [details[open]_&>svg]:rotate-90">
          {/* ลูกศรชี้ขวา หมุนลงเมื่อเปิด */}
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-slate-500 transition-transform duration-150" aria-hidden>
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('detail.edit')}
        </summary>
        <form onSubmit={onSubmit} className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-title" className="mb-1 block text-sm font-medium">{t('detail.titleLabel')}</label>
            <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="edit-tags" className="mb-1 block text-sm font-medium">{t('tags.label')}</label>
            <TagInput id="edit-tags" value={tags} onChange={setTags} />
          </div>
          <div>
            <label htmlFor="edit-starts" className="mb-1 block text-sm font-medium">{t('detail.startsLabel')}</label>
            <input id="edit-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="edit-expires" className="mb-1 block text-sm font-medium">{t('detail.expiresLabel')}</label>
            <input id="edit-expires" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-[10px] bg-navy px-5 py-2 font-semibold text-surface hover:opacity-90 disabled:opacity-50">{t('common.save')}</button>
            <button
              type="button"
              onClick={() => save({ isActive: !link.isActive }, link.isActive ? t('history.disabledToast') : t('history.enabledToast'))}
              // ลิงก์ที่ถูกระงับ เจ้าของเปิดปิดเองไม่ได้
              disabled={saving || !!link.lockedAt}
              className="rounded-[10px] border border-line px-4 py-2 text-sm font-medium hover:bg-mist"
            >
              {link.isActive ? t('detail.disable') : t('detail.enable')}
            </button>
            <button type="button" onClick={() => setConfirmTrash(true)} className="rounded-[10px] border border-brand/40 px-4 py-2 text-sm font-medium text-brand hover:bg-red-50">
              {t('detail.moveToTrash')}
            </button>
          </div>
        </form>
      </details>

      {/* หัวข้อสถิติและตัวเลือกช่วงวัน */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-xl font-bold">{t('detail.statsTitle')}</h2>
        <div className="flex rounded-[10px] border border-line bg-surface p-1 print:hidden" role="group" aria-label={t('detail.statsTitle')}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              aria-pressed={days === r}
              className={`rounded-md px-3 py-1 text-sm font-medium ${days === r ? 'bg-navy text-surface' : 'text-slate-600 hover:bg-mist'}`}
            >
              {t('detail.range', { n: r })}
            </button>
          ))}
        </div>
      </div>

      {/* ระบบสถิติไม่พร้อม */}
      {statsDown && <LoadError message={t('detail.statsDown')} onRetry={loadStats} />}

      {stats && (
        <>
          {/* ตัวเลขสรุปแบบแถบ */}
          <StatStrip
            items={[
              { label: t('detail.totalClicks'), value: fmt.number(stats.totalClicks), hint: t('detail.sinceCreated') },
              { label: t('detail.unique'), value: fmt.number(stats.uniqueVisitors), hint: t('detail.uniqueHint') },
              { label: t('detail.bots'), value: fmt.number(stats.botClicks), hint: t('detail.botsHint') },
              { label: t('detail.lastClick'), value: <span className="text-lg font-semibold">{fmt.dateTime(stats.lastClickAt)}</span> },
            ]}
          />

          {/* กราฟรายวัน */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('detail.daily', { n: days })}</h3>
            <DailyClicksChart data={stats.daily} />
          </Card>

          {/* แผนที่ประเทศ พร้อมรายการประเทศ (อ่านค่าตรงๆ ได้โดยไม่ต้องดูสี) */}
          <Card>
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('detail.countries')}</h3>
                <CountryMap data={stats.countries} />
              </div>
              {/* หัวข้อเป็นช่องว่าง (ใช้หัวข้อร่วมกับแผนที่) แต่ยังเว้นความสูงไว้ให้แถวแรกตรงกับแผนที่ */}
              <BreakdownBars title={' '} data={stats.countries} rename={fmt.country} limit={8} />
            </div>
          </Card>

          {/* แยกตามกลุ่ม */}
          <Card>
            <div className="grid gap-8 md:grid-cols-2 print:grid-cols-2">
              <BreakdownBars title={t('detail.devices')} data={stats.devices} rename={fmt.device} />
              <BreakdownBars title={t('detail.referers')} data={stats.referers} rename={fmt.referer} />
              <BreakdownBars title={t('detail.browsers')} data={stats.browsers} />
              <BreakdownBars title={t('detail.os')} data={stats.os} />
            </div>
          </Card>

          {/* คลิกล่าสุด */}
          <Card className="overflow-hidden p-0">
            <h3 className="px-5 pt-4 text-sm font-semibold text-slate-700">{t('detail.recent')}</h3>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">{t('detail.colTime')}</th>
                    <th className="px-5 py-2 font-medium">{t('detail.colDevice')}</th>
                    <th className="px-5 py-2 font-medium">{t('detail.colBrowser')}</th>
                    <th className="px-5 py-2 font-medium">{t('detail.colCountry')}</th>
                    <th className="px-5 py-2 font-medium">{t('detail.colFrom')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stats.recent.map((c, i) => (
                    <tr key={i}>
                      <td className="tabular whitespace-nowrap px-5 py-2">{fmt.dateTime(c.clickedAt)}</td>
                      <td className="px-5 py-2">{fmt.device(c.deviceType)}</td>
                      <td className="px-5 py-2">{[c.browser, c.os].filter(Boolean).join(' / ') || '-'}</td>
                      <td className="px-5 py-2">{fmt.country(c.country)}</td>
                      <td className="max-w-[240px] truncate px-5 py-2" title={c.referer ?? ''}>{c.referer || t('referer.direct')}</td>
                    </tr>
                  ))}
                  {stats.recent.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-slate-500">{t('detail.noClicks')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* กล่องยืนยันการย้ายไปถังขยะ */}
      <ConfirmDialog
        open={confirmTrash}
        title={t('history.trashTitle')}
        message={t('history.trashMessage', { code: link.shortCode, days: TRASH_DAYS })}
        confirmLabel={t('history.trashConfirm')}
        onConfirm={moveToTrash}
        onCancel={() => setConfirmTrash(false)}
      />
    </div>
  );
}
