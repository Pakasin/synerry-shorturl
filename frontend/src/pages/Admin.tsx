// นำเข้า state และ effect ของ React
import { useCallback, useEffect, useState, type FormEvent } from 'react';
// นำเข้าเมนูแท็บ ตัวแสดงหน้าย่อย และตัวพาไปหน้าอื่น
import { Navigate, NavLink, Outlet } from 'react-router';
// นำเข้าตัวแสดงแจ้งเตือน
import { toast } from 'sonner';
// นำเข้าตัวเรียก API และชนิดข้อมูล
import { api, ApiError, type AdminLink, type AdminSummary, type AdminUser, type BlockedDomain, type Paged } from '../api';
// นำเข้าข้อมูล login
import { useAuth } from '../auth';
// นำเข้าตัวจัดรูปแบบ
import { useFormat } from '../format';
// นำเข้าภาษาและตัวแปลง error
import { useErrorText, useI18n } from '../i18n';
// นำเข้า class ช่องกรอกและข้อความ error ใต้ช่อง
import { FieldError, inputCls } from '../components/ShortenForm';
// นำเข้า component พื้นฐาน
import { Card, ConfirmDialog, LoadError, StatStrip, StatusBadge } from '../components/ui';

// จำนวนแถวต่อหน้าในตารางผู้ดูแล
const PAGE_SIZE = 20;

// class ของแท็บ
const tabCls = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-brand text-navy' : 'border-transparent text-slate-500 hover:text-navy'}`;

// class ของปุ่มเล็กในตาราง
const rowBtn = 'rounded-md px-2 py-1.5 text-sm font-medium hover:bg-mist';

// ช่องค้นหาที่หน่วงเวลา 300ms หลังหยุดพิมพ์
function useDebounced(value: string) {
  // ค่าที่หน่วงแล้ว
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    // ตั้งเวลา
    const timer = setTimeout(() => setDebounced(value.trim()), 300);
    // พิมพ์ต่อก่อนครบเวลา ยกเลิกของเดิม
    return () => clearTimeout(timer);
  }, [value]);
  // คืนค่าที่หน่วงแล้ว
  return debounced;
}

// ปุ่มก่อนหน้า/ถัดไป
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // จำนวนหน้า
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
      <span className="text-slate-500">{t('history.summary', { total: fmt.number(total), page, pages })}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-[10px] border border-line px-3 py-1 hover:bg-mist disabled:opacity-40">{t('history.prev')}</button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-[10px] border border-line px-3 py-1 hover:bg-mist disabled:opacity-40">{t('history.next')}</button>
      </div>
    </div>
  );
}

// โครงหน้าผู้ดูแล: หัวข้อและแท็บ ผู้ที่ไม่ใช่ผู้ดูแลถูกพากลับหน้าแรก (สิทธิ์จริงตรวจที่ gateway)
export function AdminLayout() {
  // ผู้ใช้ปัจจุบัน
  const { user } = useAuth();
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ไม่ใช่ผู้ดูแล ไม่ต้องแสดงหน้านี้
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
      {/* แท็บ เลื่อนแนวนอนได้บนจอเล็ก */}
      <nav className="-mx-1 flex overflow-x-auto border-b border-line" aria-label={t('admin.title')}>
        <NavLink to="/admin" end className={tabCls}>{t('admin.tabOverview')}</NavLink>
        <NavLink to="/admin/users" className={tabCls}>{t('admin.tabUsers')}</NavLink>
        <NavLink to="/admin/links" className={tabCls}>{t('admin.tabLinks')}</NavLink>
        <NavLink to="/admin/blocklist" className={tabCls}>{t('admin.tabBlocklist')}</NavLink>
      </nav>
      {/* หน้าย่อยตามแท็บ */}
      <Outlet />
    </div>
  );
}

// แท็บภาพรวม: ตัวเลขทั้งระบบ
export function AdminOverview() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ข้อมูลสรุป
  const [data, setData] = useState<AdminSummary | null>(null);
  // error ล่าสุด
  const [error, setError] = useState<string | null>(null);

  // โหลดข้อมูล
  const load = useCallback(() => {
    api<AdminSummary>('/admin/summary')
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorText(err)));
  }, [errorText]);

  // โหลดครั้งแรก
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      {/* โหลดไม่สำเร็จ */}
      {error && <LoadError message={error} onRetry={load} />}
      {/* ตัวเลขสรุป */}
      <StatStrip
        items={[
          { label: t('admin.users'), value: fmt.number(data?.users) },
          { label: t('admin.suspendedUsers'), value: fmt.number(data?.suspendedUsers) },
          { label: t('admin.links'), value: fmt.number(data?.links) },
          { label: t('admin.linksLast7Days'), value: fmt.number(data?.linksLast7Days) },
          { label: t('admin.lockedLinks'), value: fmt.number(data?.lockedLinks) },
          { label: t('admin.blockedDomains'), value: fmt.number(data?.blockedDomains) },
          { label: t('admin.totalClicks'), value: fmt.number(data?.totalClicks) },
        ]}
      />
      {/* คำอธิบายว่าแต่ละแท็บใช้ทำอะไร */}
      <p className="max-w-[65ch] text-slate-600">{t('admin.overviewHint')}</p>
    </div>
  );
}

// แท็บผู้ใช้: ค้นหา ดูจำนวนลิงก์ ระงับหรือเปิดบัญชีคืน
export function AdminUsers() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ผู้ใช้ที่ login อยู่ (ห้ามระงับตัวเอง)
  const { user: me } = useAuth();
  // ข้อความค้นหา
  const [search, setSearch] = useState('');
  // คำค้นที่หน่วงแล้ว
  const q = useDebounced(search);
  // หน้าปัจจุบัน
  const [page, setPage] = useState(1);
  // ข้อมูล
  const [data, setData] = useState<Paged<AdminUser> | null>(null);
  // error ล่าสุด
  const [error, setError] = useState<string | null>(null);
  // ผู้ใช้ที่กำลังจะระงับ (เปิดกล่องยืนยัน)
  const [toSuspend, setToSuspend] = useState<AdminUser | null>(null);
  // กำลังทำงาน
  const [busy, setBusy] = useState(false);

  // โหลดรายการ
  const load = useCallback(() => {
    // สร้าง query string
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    // ใส่คำค้นถ้ามี
    if (q) params.set('q', q);
    // เรียก API
    api<Paged<AdminUser>>(`/admin/users?${params}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorText(err)));
  }, [page, q, errorText]);

  // โหลดใหม่เมื่อหน้าหรือคำค้นเปลี่ยน
  useEffect(load, [load]);
  // เปลี่ยนคำค้นแล้วกลับหน้าแรก
  useEffect(() => setPage(1), [q]);

  // เปลี่ยนสถานะบัญชี
  const setActive = async (u: AdminUser, isActive: boolean) => {
    // เริ่มทำงาน
    setBusy(true);
    try {
      // เรียก API
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { isActive } });
      // แจ้งผล
      toast.success(isActive ? t('admin.unsuspendedToast') : t('admin.suspendedToast'));
      // ปิดกล่องยืนยัน
      setToSuspend(null);
      // โหลดใหม่
      load();
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    } finally {
      // ทำงานเสร็จ
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ช่องค้นหา */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('admin.searchUsers')}
        aria-label={t('admin.searchUsers')}
        className={`${inputCls} max-w-sm`}
      />
      {/* โหลดไม่สำเร็จ */}
      {error && <LoadError message={error} onRetry={load} />}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t('admin.colUser')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colRole')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('admin.colLinks')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colJoined')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colAccount')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.items.map((u) => (
                <tr key={u.id}>
                  {/* ชื่อผู้ใช้ และบอกว่าแถวไหนคือตัวเอง */}
                  <td className="px-4 py-3 font-medium">
                    {u.username} {u.id === me?.id && <span className="font-normal text-slate-500">{t('admin.you')}</span>}
                  </td>
                  {/* บทบาท */}
                  <td className="px-4 py-3">{u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}</td>
                  {/* จำนวนลิงก์ */}
                  <td className="tabular px-4 py-3 text-right">{fmt.number(u.linkCount)}</td>
                  {/* วันที่สมัคร */}
                  <td className="tabular whitespace-nowrap px-4 py-3 text-slate-500">{fmt.dateTime(u.createdAt)}</td>
                  {/* สถานะบัญชี มีจุดสีและข้อความ */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 ${u.isActive ? 'text-green-700' : 'text-brand'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-green-600' : 'bg-brand'}`} aria-hidden />
                      {u.isActive ? t('admin.accountActive') : t('admin.accountSuspended')}
                    </span>
                  </td>
                  {/* ปุ่มจัดการ: ไม่มีปุ่มสำหรับผู้ดูแลด้วยกันและตัวเอง */}
                  <td className="px-4 py-3 text-right">
                    {u.role !== 'admin' &&
                      (u.isActive ? (
                        <button onClick={() => setToSuspend(u)} className={`${rowBtn} text-brand hover:bg-red-50`}>{t('admin.suspend')}</button>
                      ) : (
                        <button onClick={() => setActive(u, true)} disabled={busy} className={rowBtn}>{t('admin.unsuspend')}</button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pager page={page} total={data.total} onPage={setPage} />}
      </Card>

      {/* กล่องยืนยันการระงับ */}
      <ConfirmDialog
        open={!!toSuspend}
        title={t('admin.suspendTitle', { name: toSuspend?.username ?? '' })}
        message={t('admin.suspendMessage', { name: toSuspend?.username ?? '' })}
        confirmLabel={t('admin.suspend')}
        busy={busy}
        onConfirm={() => toSuspend && setActive(toSuspend, false)}
        onCancel={() => setToSuspend(null)}
      />
    </div>
  );
}

// แท็บลิงก์ทั้งหมด: ค้นหา กรองที่ถูกระงับ ระงับหรือยกเลิกการระงับ
export function AdminLinks() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ข้อความค้นหา
  const [search, setSearch] = useState('');
  // คำค้นที่หน่วงแล้ว
  const q = useDebounced(search);
  // ตัวกรอง
  const [filter, setFilter] = useState<'all' | 'locked'>('all');
  // หน้าปัจจุบัน
  const [page, setPage] = useState(1);
  // ข้อมูล
  const [data, setData] = useState<Paged<AdminLink> | null>(null);
  // error ล่าสุด
  const [error, setError] = useState<string | null>(null);
  // ลิงก์ที่กำลังจะระงับ
  const [toLock, setToLock] = useState<AdminLink | null>(null);
  // เหตุผลที่พิมพ์
  const [reason, setReason] = useState('');
  // error ของช่องเหตุผล
  const [reasonError, setReasonError] = useState<string | undefined>();
  // กำลังทำงาน
  const [busy, setBusy] = useState(false);

  // โหลดรายการ
  const load = useCallback(() => {
    // สร้าง query string
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), filter });
    // ใส่คำค้นถ้ามี
    if (q) params.set('q', q);
    // เรียก API
    api<Paged<AdminLink>>(`/admin/links?${params}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorText(err)));
  }, [page, q, filter, errorText]);

  // โหลดใหม่เมื่อตัวเลือกเปลี่ยน
  useEffect(load, [load]);
  // เปลี่ยนคำค้นหรือตัวกรองแล้วกลับหน้าแรก
  useEffect(() => setPage(1), [q, filter]);

  // เปิดกล่องระงับ
  const openLock = (l: AdminLink) => {
    setToLock(l);
    setReason('');
    setReasonError(undefined);
  };

  // ระงับลิงก์
  const lock = async () => {
    // ไม่มีลิงก์ที่เลือก
    if (!toLock) return;
    // เริ่มทำงาน
    setBusy(true);
    try {
      // เรียก API พร้อมเหตุผล
      await api(`/admin/links/${toLock.id}/lock`, { method: 'POST', body: { reason } });
      // แจ้งผล
      toast.success(t('admin.lockedToast'));
      // ปิดกล่อง
      setToLock(null);
      // โหลดใหม่
      load();
    } catch (err) {
      // เหตุผลสั้นเกิน แสดงใต้ช่อง
      if (err instanceof ApiError && err.fieldError('reason')) setReasonError(err.fieldError('reason'));
      // แจ้ง error
      else toast.error(errorText(err));
    } finally {
      // ทำงานเสร็จ
      setBusy(false);
    }
  };

  // ยกเลิกการระงับ
  const unlock = async (l: AdminLink) => {
    try {
      // เรียก API
      await api(`/admin/links/${l.id}/unlock`, { method: 'POST' });
      // แจ้งผล
      toast.success(t('admin.unlockedToast'));
      // โหลดใหม่
      load();
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    }
  };

  // class ของปุ่มตัวกรอง
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-sm font-medium ring-1 ${active ? 'bg-navy text-surface ring-navy' : 'bg-surface text-slate-600 ring-line hover:bg-mist'}`;

  return (
    <div className="space-y-4">
      {/* ค้นหาและตัวกรอง */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.searchLinks')}
          aria-label={t('admin.searchLinks')}
          className={`${inputCls} max-w-sm`}
        />
        <div className="flex gap-2" role="group">
          <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={chip(filter === 'all')}>{t('admin.filterAll')}</button>
          <button type="button" onClick={() => setFilter('locked')} aria-pressed={filter === 'locked'} className={chip(filter === 'locked')}>{t('admin.filterLocked')}</button>
        </div>
      </div>
      {/* โหลดไม่สำเร็จ */}
      {error && <LoadError message={error} onRetry={load} />}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t('history.colLink')}</th>
                <th className="px-4 py-3 font-medium">{t('admin.colOwner')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colClicks')}</th>
                <th className="px-4 py-3 font-medium">{t('history.colStatus')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('history.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.items.map((l) => (
                <tr key={l.id} className="align-top">
                  {/* รหัสสั้นและปลายทาง */}
                  <td className="max-w-[320px] px-4 py-3">
                    <a href={l.shortUrl} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">/{l.shortCode}</a>
                    <div className="truncate text-slate-500" title={l.originalUrl}>{l.originalUrl}</div>
                    {/* เหตุผลที่ระงับ */}
                    {l.lockReason && <div className="mt-1 text-xs text-brand">{t('detail.lockedReason', { reason: l.lockReason })}</div>}
                  </td>
                  {/* เจ้าของ ถ้าบัญชีถูกระงับบอกด้วย */}
                  <td className="px-4 py-3">
                    {l.owner}
                    {!l.ownerActive && <div className="text-xs text-brand">{t('admin.accountSuspended')}</div>}
                  </td>
                  {/* คลิก */}
                  <td className="tabular px-4 py-3 text-right font-semibold">{fmt.number(l.clicks)}</td>
                  {/* สถานะ */}
                  <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  {/* ปุ่ม */}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {l.lockedAt ? (
                      <button onClick={() => unlock(l)} className={rowBtn}>{t('admin.unlock')}</button>
                    ) : (
                      <button onClick={() => openLock(l)} className={`${rowBtn} text-brand hover:bg-red-50`}>{t('admin.lock')}</button>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">{t('history.noMatch')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && <Pager page={page} total={data.total} onPage={setPage} />}
      </Card>

      {/* กล่องระงับลิงก์ พร้อมช่องเหตุผล */}
      <ConfirmDialog
        open={!!toLock}
        title={t('admin.lockTitle', { code: toLock?.shortCode ?? '' })}
        message={t('admin.lockMessage')}
        confirmLabel={t('admin.lock')}
        busy={busy}
        onConfirm={lock}
        onCancel={() => setToLock(null)}
      >
        <div className="mt-4">
          <label htmlFor="lock-reason" className="mb-1 block text-sm font-medium">{t('admin.lockReason')}</label>
          <input id="lock-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.lockReasonPlaceholder')} className={inputCls} />
          <FieldError message={reasonError} />
        </div>
      </ConfirmDialog>
    </div>
  );
}

// แท็บ blocklist: เพิ่มและลบโดเมนที่บล็อก
export function AdminBlocklist() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวแปลง error
  const errorText = useErrorText();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ข้อมูล
  const [data, setData] = useState<{ builtIn: string[]; items: BlockedDomain[] } | null>(null);
  // error ของการโหลด
  const [error, setError] = useState<string | null>(null);
  // ค่าในฟอร์ม
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  // error ของช่องโดเมน
  const [domainError, setDomainError] = useState<string | undefined>();
  // กำลังส่ง
  const [busy, setBusy] = useState(false);

  // โหลดรายการ
  const load = useCallback(() => {
    api<{ builtIn: string[]; items: BlockedDomain[] }>('/admin/blocklist')
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorText(err)));
  }, [errorText]);

  // โหลดครั้งแรก
  useEffect(load, [load]);

  // เพิ่มโดเมน
  const add = async (e: FormEvent) => {
    // ไม่ให้โหลดหน้าใหม่
    e.preventDefault();
    // เริ่มส่ง
    setBusy(true);
    // ล้าง error เดิม
    setDomainError(undefined);
    try {
      // เรียก API
      await api('/admin/blocklist', { method: 'POST', body: { domain, reason } });
      // แจ้งผล
      toast.success(t('admin.blockedToast'));
      // ล้างฟอร์ม
      setDomain('');
      setReason('');
      // โหลดใหม่
      load();
    } catch (err) {
      // แสดงปัญหาใต้ช่องโดเมน
      if (err instanceof ApiError) setDomainError(err.fieldError('domain') ?? errorText(err));
      // error อื่น
      else toast.error(errorText(err));
    } finally {
      // ส่งเสร็จ
      setBusy(false);
    }
  };

  // ลบโดเมน
  const remove = async (item: BlockedDomain) => {
    try {
      // เรียก API
      await api(`/admin/blocklist/${item.id}`, { method: 'DELETE' });
      // แจ้งผล
      toast.success(t('admin.unblockedToast'));
      // โหลดใหม่
      load();
    } catch (err) {
      // แจ้ง error
      toast.error(errorText(err));
    }
  };

  return (
    <div className="space-y-8">
      {/* ฟอร์มเพิ่มโดเมน */}
      <form onSubmit={add} className="max-w-3xl space-y-3" noValidate>
        <h2 className="text-lg font-bold">{t('admin.blockTitle')}</h2>
        <p className="max-w-[65ch] text-sm text-slate-600">{t('admin.blockHint')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <div>
            <label htmlFor="block-domain" className="mb-1 block text-sm font-medium">{t('admin.blockDomain')}</label>
            <input id="block-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t('admin.blockDomainPlaceholder')} className={inputCls} />
            <FieldError message={domainError} />
          </div>
          <div>
            <label htmlFor="block-reason" className="mb-1 block text-sm font-medium">{t('admin.blockReason')}</label>
            <input id="block-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
          </div>
          <button type="submit" disabled={busy || !domain.trim()} className="rounded-[10px] bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:mt-7">
            {t('admin.blockAdd')}
          </button>
        </div>
      </form>

      {/* โหลดไม่สำเร็จ */}
      {error && <LoadError message={error} onRetry={load} />}

      {/* รายการที่ผู้ดูแลเพิ่ม */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t('admin.customList')}</h2>
        <Card className="p-0">
          {data && data.items.length === 0 && <p className="px-5 py-6 text-slate-500">{t('admin.customEmpty')}</p>}
          <ul className="divide-y divide-line">
            {data?.items.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{b.domain}</div>
                  {b.reason && <div className="text-sm text-slate-600">{b.reason}</div>}
                  <div className="text-xs text-slate-500">{t('admin.addedBy', { name: b.createdBy ?? '-', date: fmt.dateTime(b.createdAt) })}</div>
                </div>
                <button onClick={() => remove(b)} className={rowBtn}>{t('admin.unblock')}</button>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* รายการที่ติดมากับระบบ */}
      {data && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600">{t('admin.builtInList')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {data.builtIn.map((d) => (
              <span key={d} className="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-slate-700">{d}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
