// นำเข้าฟังก์ชันของ React
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
// นำเข้าตัววาด component ไว้นอกโครงหน้า (ให้ลอยเหนือทุกอย่าง)
import { createPortal } from 'react-dom';
// นำเข้าฟังก์ชันแปล
import { useI18n, type MessageKey } from '../i18n';

// ขั้นหนึ่งของคู่มือ: ชี้ไปที่ element ที่มี data-tour ตรงกับ target (ถ้าไม่มี target แสดงกลางจอ)
export type TourStep = { id: string; target?: string };

// ระยะห่างรอบกรอบไฮไลต์ (px)
const PAD = 6;
// ความกว้างสูงสุดของกล่องคำอธิบาย (px)
const POPOVER_W = 360;
// ระยะห่างจากขอบจอ (px)
const EDGE = 16;

// ตรวจว่าผู้ใช้ตั้งค่าลดการเคลื่อนไหวไว้หรือไม่
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// คู่มือแนะนำการใช้งานทีละขั้น: หรี่จอ ไฮไลต์ส่วนที่อธิบาย และมีกล่องคำอธิบายพร้อมปุ่มก่อนหน้า/ถัดไป/ข้าม
export function Tour({ steps, onFinish }: { steps: TourStep[]; onFinish: () => void }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ขั้นปัจจุบัน
  const [index, setIndex] = useState(0);
  // ตำแหน่งของ element ที่ไฮไลต์ (null = แสดงกลางจอ)
  const [rect, setRect] = useState<DOMRect | null>(null);
  // ขนาดของกล่องคำอธิบาย ใช้คำนวณตำแหน่งไม่ให้ล้นจอ
  const [boxH, setBoxH] = useState(0);
  // อ้างอิงกล่องคำอธิบาย
  const boxRef = useRef<HTMLDivElement>(null);
  // อ้างอิงปุ่มหลัก เพื่อย้าย focus ไปที่ปุ่มทุกครั้งที่เปลี่ยนขั้น
  const primaryRef = useRef<HTMLButtonElement>(null);
  // ขั้นปัจจุบัน
  const step = steps[index];
  // เป็นขั้นสุดท้ายหรือไม่
  const last = index === steps.length - 1;

  // หา element เป้าหมายของขั้นนี้ (ถ้าซ่อนอยู่ เช่นบนจอแคบ ให้ถือว่าไม่มี)
  const findTarget = useCallback(() => {
    // ไม่มีเป้าหมาย
    if (!step.target) return null;
    // หาตาม data-tour
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    // ไม่มี หรือมองไม่เห็น (กว้างหรือสูงเป็น 0)
    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return null;
    // คืน element
    return el;
  }, [step.target]);

  // วัดตำแหน่ง element เป้าหมายใหม่
  const measure = useCallback(() => {
    // หาเป้าหมาย
    const el = findTarget();
    // เก็บตำแหน่ง
    setRect(el ? el.getBoundingClientRect() : null);
  }, [findTarget]);

  // เปลี่ยนขั้น: เลื่อนจอให้เห็นเป้าหมาย แล้ววัดตำแหน่ง
  useLayoutEffect(() => {
    // หาเป้าหมาย
    const el = findTarget();
    // เลื่อนให้อยู่กลางจอ (ไม่ลื่นถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหว)
    el?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    // วัดทันที และวัดซ้ำหลังเลื่อนเสร็จ
    measure();
    const timer = setTimeout(measure, 350);
    // ยกเลิกตัวจับเวลาถ้าเปลี่ยนขั้นก่อน
    return () => clearTimeout(timer);
  }, [findTarget, measure]);

  // ย่อขยายจอหรือเลื่อนจอ ให้วัดตำแหน่งใหม่
  useEffect(() => {
    // ฟังทั้ง resize และ scroll (capture เพื่อจับ scroll ของทุกกล่อง)
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // เลิกฟังเมื่อปิดคู่มือ
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // วัดความสูงของกล่องคำอธิบายทุกครั้งที่เนื้อหาเปลี่ยน และย้าย focus ไปที่ปุ่มหลัก
  useLayoutEffect(() => {
    setBoxH(boxRef.current?.offsetHeight ?? 0);
    primaryRef.current?.focus();
  }, [index, t]);

  // ไปขั้นถัดไป หรือจบถ้าเป็นขั้นสุดท้าย
  const next = useCallback(() => (last ? onFinish() : setIndex((i) => i + 1)), [last, onFinish]);
  // ย้อนกลับหนึ่งขั้น
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // คีย์บอร์ด: Esc = ข้าม, ลูกศรขวา = ถัดไป, ลูกศรซ้าย = ก่อนหน้า
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') back();
    };
    // เริ่มฟัง
    window.addEventListener('keydown', onKey);
    // เลิกฟัง
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onFinish]);

  // ขนาดจอ
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // จอแคบ: กล่องคำอธิบายชิดล่างเต็มความกว้าง
  const narrow = vw < 640;
  // ความกว้างจริงของกล่อง
  const width = Math.min(POPOVER_W, vw - EDGE * 2);

  // คำนวณตำแหน่งกล่องคำอธิบาย
  let style: CSSProperties;
  if (narrow) {
    // จอแคบ: ชิดล่าง
    style = { left: EDGE, right: EDGE, bottom: EDGE };
  } else if (!rect) {
    // ไม่มีเป้าหมาย: กลางจอ
    style = { left: (vw - width) / 2, top: Math.max(EDGE, (vh - boxH) / 2), width };
  } else {
    // มีที่ว่างใต้เป้าหมายพอไหม ถ้าไม่พอให้ขึ้นไปอยู่เหนือเป้าหมาย
    const below = rect.bottom + PAD + 12;
    const top = below + boxH + EDGE <= vh ? below : Math.max(EDGE, rect.top - PAD - 12 - boxH);
    // ชิดซ้ายตามเป้าหมาย แต่ไม่ให้ล้นขอบจอ
    const left = Math.min(Math.max(EDGE, rect.left), vw - width - EDGE);
    style = { left, top, width };
  }

  // วาดคู่มือไว้ที่ท้าย <body> ให้อยู่เหนือทุกอย่าง
  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* กันการคลิกหน้าเว็บด้านหลังระหว่างดูคู่มือ ถ้าไม่มีเป้าหมายให้หรี่ทั้งจอ */}
      <div className={`absolute inset-0 ${rect ? '' : 'bg-black/60'}`} />

      {/* กรอบไฮไลต์: เงาขนาดใหญ่รอบกรอบทำหน้าที่หรี่จอส่วนอื่น เหลือเฉพาะส่วนที่อธิบายสว่าง */}
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

      {/* กล่องคำอธิบาย */}
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="absolute rounded-2xl bg-surface p-5 shadow-[0_24px_48px_-12px_rgb(0_0_0/0.45)]"
        style={style}
      >
        {/* บอกว่าอยู่ขั้นไหน (คู่มือเป็นลำดับขั้นจริง จึงใส่ตัวเลข) และแถบความคืบหน้า */}
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span className="tabular">{t('tour.step', { n: index + 1, total: steps.length })}</span>
          <span className="flex gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-brand' : 'w-1.5 bg-slate-300'}`} />
            ))}
          </span>
        </div>
        {/* หัวข้อและคำอธิบาย */}
        <h2 id="tour-title" className="text-lg font-bold leading-snug">{t(`tour.${step.id}.title` as MessageKey)}</h2>
        <p id="tour-body" className="mt-2 text-slate-600">{t(`tour.${step.id}.body` as MessageKey)}</p>
        {/* ปุ่ม: ข้ามชิดซ้าย ก่อนหน้า/ถัดไปชิดขวา */}
        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={onFinish} className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-500 hover:text-navy">
            {t('tour.skip')}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={back} className="rounded-[10px] border border-line px-3 py-1.5 text-sm font-medium hover:bg-mist">
                {t('tour.back')}
              </button>
            )}
            <button ref={primaryRef} type="button" onClick={next} className="rounded-[10px] bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
              {last ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
