// นำเข้า state และ effect ของ React
import { useCallback, useEffect, useState } from 'react';
// นำเข้าลิงก์ภายในเว็บ
import { Link as RouterLink } from 'react-router';
// นำเข้าตัวเรียก API และชนิดข้อมูล
import { api, type Link, type Summary } from '../api';
// นำเข้าตัวจัดรูปแบบตัวเลข
import { useFormat } from '../format';
// นำเข้าฟังก์ชันแปล
import { useI18n } from '../i18n';
// นำเข้าฟอร์มย่อลิงก์และป้ายลิงก์
import { ShortenForm } from '../components/ShortenForm';
import { LinkTag, tagButton } from '../components/LinkTag';
// นำเข้า component พื้นฐาน
import { Notice, StatStrip } from '../components/ui';

// หน้าแรกหลัง login: ย่อลิงก์เป็นงานหลัก ผลลัพธ์เป็นป้ายลิงก์ แล้วตามด้วยภาพรวมแบบเรียบ
export function Dashboard() {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ลิงก์ที่เพิ่งสร้าง (หรือลิงก์เดิมที่เลือกใช้) ใช้แสดงป้ายลิงก์
  const [created, setCreated] = useState<Link | null>(null);
  // ข้อมูลสรุปภาพรวม
  const [summary, setSummary] = useState<Summary | null>(null);

  // โหลดข้อมูลสรุป (เรียกซ้ำหลังสร้างลิงก์ใหม่เพื่อให้ตัวเลขอัปเดต)
  const loadSummary = useCallback(() => {
    api<Summary>('/stats/summary').then(setSummary).catch(() => setSummary(null));
  }, []);

  // โหลดครั้งแรกเมื่อเปิดหน้า
  useEffect(loadSummary, [loadSummary]);

  // เมื่อได้ลิงก์ เก็บผลลัพธ์และโหลดสรุปใหม่
  const onCreated = (link: Link) => {
    setCreated(link);
    loadSummary();
  };

  // ยอดคลิกสูงสุดในรายการยอดนิยม ใช้กำหนดความยาวแถบ
  const topMax = Math.max(1, ...(summary?.topLinks.map((l) => l.clicks ?? 0) ?? [0]));

  return (
    <div className="space-y-10">
      {/* ส่วนหลัก: หัวข้อใหญ่และช่องย่อลิงก์ ไม่ใส่กรอบ ให้เป็นสิ่งแรกที่เห็น */}
      <section className="max-w-3xl pt-2">
        <h1 className="text-[1.75rem] font-bold leading-tight sm:text-display">{t('shorten.title')}</h1>
        <p className="mb-6 mt-2 max-w-[60ch] text-slate-600">{t('shorten.subtitle')}</p>
        <ShortenForm onCreated={onCreated} />
      </section>

      {/* ป้ายลิงก์ของผลลัพธ์ key เปลี่ยนตามลิงก์ ทำให้ animation เล่นใหม่ทุกครั้งที่ได้ลิงก์ใหม่ */}
      {created && (
        <section aria-live="polite" className="max-w-3xl">
          <p className="mb-3 text-sm font-medium text-green-700">{t('shorten.created')}</p>
          <LinkTag
            key={created.id}
            link={created}
            animate
            extraActions={<RouterLink to={`/links/${created.id}`} className={tagButton}>{t('common.stats')}</RouterLink>}
          />
        </section>
      )}

      {/* แถบตัวเลขสรุป */}
      <StatStrip
        items={[
          { label: t('dashboard.totalLinks'), value: fmt.number(summary?.totalLinks) },
          { label: t('dashboard.activeLinks'), value: fmt.number(summary?.activeLinks) },
          { label: t('dashboard.totalClicks'), value: fmt.number(summary?.totalClicks), hint: t('dashboard.clicksHint') },
        ]}
      />

      {/* แจ้งเมื่อระบบสถิติไม่พร้อม */}
      {summary && !summary.analyticsAvailable && <Notice>{t('dashboard.analyticsDown')}</Notice>}

      {/* ลิงก์ยอดนิยม: รายการเรียงอันดับ มีแถบยาวตามยอดคลิก */}
      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold">{t('dashboard.topLinks')}</h2>
          <RouterLink to="/links" className="text-sm font-medium text-brand hover:underline">{t('dashboard.viewAll')}</RouterLink>
        </div>
        {/* ยังไม่มีคลิก */}
        {!summary || summary.topLinks.length === 0 ? (
          <p className="text-slate-500">{t('dashboard.noClicks')}</p>
        ) : (
          <ol className="space-y-4">
            {summary.topLinks.map((l, i) => (
              <li key={l.id}>
                <RouterLink to={`/links/${l.id}`} className="group grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-3">
                  {/* อันดับ (เป็นลำดับจริง จึงใส่ตัวเลข) */}
                  <span className="tabular text-sm font-semibold text-slate-500">{i + 1}</span>
                  {/* ชื่อและลิงก์สั้น */}
                  <span className="min-w-0">
                    <span className="block truncate font-medium group-hover:underline">{l.title || l.originalUrl}</span>
                    <span className="block truncate text-sm text-slate-500">/{l.shortCode}</span>
                  </span>
                  {/* จำนวนคลิก */}
                  <span className="tabular text-sm font-semibold">{t('common.clicks', { n: fmt.number(l.clicks) })}</span>
                  {/* แถบยาวตามสัดส่วนคลิก เทียบกับอันดับหนึ่ง */}
                  <span className="col-start-2 col-end-4 mt-1.5 h-1.5 rounded-full bg-slate-100">
                    <span className="block h-1.5 rounded-full bg-data" style={{ width: `${((l.clicks ?? 0) / topMax) * 100}%` }} />
                  </span>
                </RouterLink>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
