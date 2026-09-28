// นำเข้า state และ memo ของ React
import { useMemo, useState } from 'react';
// นำเข้าตัวแปลงพิกัดโลกเป็นภาพ 2 มิติ และตัวสร้างเส้นขอบประเทศ
import { geoEqualEarth, geoPath } from 'd3-geo';
// นำเข้าตัวแปลงไฟล์แผนที่ TopoJSON เป็นรูปทรงที่วาดได้
import { feature } from 'topojson-client';
// นำเข้าชนิดข้อมูลของไฟล์แผนที่
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
// นำเข้าไฟล์แผนที่โลกความละเอียดต่ำ (ขนาดเล็ก เหมาะกับหน้าเว็บ) รวมอยู่ใน bundle ไม่ต้องโหลดจากเว็บอื่น
import world from 'world-atlas/countries-110m.json';
// นำเข้าตัวแปลงรหัสประเทศและตัวจัดรูปแบบ
import { alpha2ToNumeric, useFormat } from '../format';
// นำเข้าฟังก์ชันแปล
import { useI18n } from '../i18n';
// นำเข้าสีตามธีม
import { useChartColors } from '../theme';
// นำเข้าชนิดข้อมูลการนับแยกกลุ่ม
import type { Breakdown } from '../api';

// ขนาดภาพแผนที่ (สัดส่วนตามแบบ Equal Earth)
const WIDTH = 800;
const HEIGHT = 390;

// แปลงไฟล์แผนที่เป็นรายการประเทศหนึ่งครั้งตอนโหลดไฟล์ และตัดแอนตาร์กติกา (010) ออกเพราะกินพื้นที่โดยไม่มีคนคลิก
const COUNTRIES = (
  feature(world as unknown as Topology, (world as unknown as Topology).objects.countries as GeometryCollection) as unknown as {
    features: Feature<Geometry, { name: string }>[];
  }
).features.filter((f) => f.id !== '010');

// ตัวแปลงพิกัดแบบ Equal Earth (พื้นที่ประเทศถูกสัดส่วน ไม่บวมที่ขั้วโลกแบบ Mercator) ขยายให้พอดีกรอบ
const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features: COUNTRIES });
// ตัวสร้างเส้น SVG จากรูปทรงประเทศ
const pathOf = geoPath(projection);
// คำนวณเส้นของทุกประเทศไว้ครั้งเดียว ไม่ต้องคำนวณใหม่ทุกครั้งที่ render
const PATHS = COUNTRIES.map((f) => ({ id: String(f.id ?? ''), d: pathOf(f) ?? '' }));

// แผนที่โลกระบายสีตามจำนวนคลิก (choropleth) สีเดียวไล่ความเข้ม มีกล่องบอกค่าเมื่อชี้ และคำอธิบายสี
export function CountryMap({ data }: { data: Breakdown }) {
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // สีตามธีม
  const c = useChartColors();
  // ประเทศที่กำลังชี้อยู่ และตำแหน่งกล่องบอกค่า
  const [hover, setHover] = useState<{ code: string; count: number; x: number; y: number } | null>(null);

  // แปลงข้อมูลเป็นตารางค้นหา: รหัสตัวเลข -> { รหัส 2 ตัว, จำนวน }
  const byNumeric = useMemo(() => {
    // ตารางค้นหา
    const m = new Map<string, { code: string; count: number }>();
    // ใส่ทุกประเทศที่รู้จัก (ไม่นับ Unknown)
    for (const d of data) {
      // แปลงรหัส
      const numeric = d.name !== 'Unknown' ? alpha2ToNumeric(d.name) : undefined;
      // ใส่ลงตาราง
      if (numeric) m.set(numeric, { code: d.name, count: d.count });
    }
    // คืนตาราง
    return m;
  }, [data]);

  // ค่ามากสุด ใช้แบ่งขั้นสี
  const max = Math.max(1, ...[...byNumeric.values()].map((v) => v.count));

  // เลือกขั้นสีจากจำนวน ใช้รากที่สองเพราะประเทศหลัก (ไทย) มีคลิกมากกว่าที่อื่นมาก ถ้าแบ่งเป็นเส้นตรง ประเทศอื่นจะสีเดียวกันหมด
  const colorOf = (count: number) => {
    // ไม่มีคลิก ใช้สีพื้น
    if (count <= 0) return c.mapEmpty;
    // สัดส่วนหลังถอดราก (0-1]
    const ratio = Math.sqrt(count / max);
    // เลือกขั้น 0-4
    return c.mapRamp[Math.min(c.mapRamp.length - 1, Math.floor(ratio * c.mapRamp.length))];
  };

  // ค่าที่แต่ละขั้นเริ่ม ใช้แสดงในคำอธิบายสี (ย้อนสูตรรากที่สอง)
  const legendStops = c.mapRamp.map((color, i) => ({ color, from: Math.max(1, Math.ceil(max * (i / c.mapRamp.length) ** 2)) }));

  return (
    <div className="relative">
      {/* แผนที่ ขยายตามความกว้างกล่อง */}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={t('detail.countries')} onMouseLeave={() => setHover(null)}>
        {PATHS.map((p) => {
          // ข้อมูลของประเทศนี้ (ถ้ามีคลิก)
          const v = byNumeric.get(p.id);
          return (
            <path
              key={p.id + p.d.length}
              d={p.d}
              fill={colorOf(v?.count ?? 0)}
              // เส้นขอบบางสีพื้น ช่วยแยกประเทศที่ติดกัน
              stroke={c.mapStroke}
              strokeWidth={0.5}
              // ชี้แล้วแสดงกล่องบอกค่า เฉพาะประเทศที่มีคลิก
              onMouseMove={(e) => {
                // ไม่มีคลิก ไม่ต้องแสดง
                if (!v) return setHover(null);
                // ตำแหน่งเมาส์เทียบกับกล่องแผนที่
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                // เก็บข้อมูลที่จะแสดง
                setHover({ ...v, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
            />
          );
        })}
      </svg>

      {/* กล่องบอกค่าเมื่อชี้ประเทศ */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-sm shadow-md"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {t('map.tooltip', { name: fmt.country(hover.code), n: fmt.number(hover.count) })}
        </div>
      )}

      {/* คำอธิบายสี: ช่องสีพร้อมค่าเริ่มของแต่ละขั้น */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>{t('map.legend')}:</span>
        {legendStops.map((s) => (
          <span key={s.color} className="inline-flex items-center gap-1">
            <span className="h-3 w-5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {fmt.number(s.from)}+
          </span>
        ))}
      </div>
    </div>
  );
}
