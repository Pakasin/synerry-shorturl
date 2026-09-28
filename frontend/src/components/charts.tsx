// นำเข้าส่วนประกอบกราฟจาก recharts
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
// นำเข้าตัวจัดรูปแบบวันที่และตัวเลข
import { useFormat } from '../format';
// นำเข้าฟังก์ชันแปล
import { useI18n } from '../i18n';
// นำเข้าสีกราฟตามธีม
import { useChartColors } from '../theme';
// นำเข้าชนิดข้อมูลการนับแยกกลุ่ม
import type { Breakdown } from '../api';

// กราฟจำนวนคลิกรายวัน: เส้นเดียว สีเดียว มีพื้นจางใต้เส้น และกล่องบอกค่าเมื่อชี้
export function DailyClicksChart({ data }: { data: { date: string; clicks: number }[] }) {
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // สีตามธีม
  const c = useChartColors();
  return (
    // ปรับความกว้างตามกล่องที่ครอบ สูง 240px
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          {/* เส้นตารางแนวนอนเท่านั้น สีจาง */}
          <CartesianGrid vertical={false} stroke={c.grid} />
          {/* แกนวันที่ แสดงแบบสั้น และเว้นระยะไม่ให้ตัวอักษรชนกัน */}
          <XAxis dataKey="date" tickFormatter={fmt.shortDate} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={24} />
          {/* แกนจำนวนคลิก เป็นจำนวนเต็มเท่านั้น */}
          <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} />
          {/* กล่องบอกค่าเมื่อชี้ พร้อมเส้นแนวตั้ง */}
          <Tooltip
            cursor={{ stroke: c.muted, strokeDasharray: '3 3' }}
            labelFormatter={(d) => fmt.shortDate(String(d))}
            formatter={(v) => [t('common.clicks', { n: fmt.number(Number(v)) }), t('chart.clicks')]}
            contentStyle={{ borderRadius: 10, borderColor: c.grid, background: c.tooltipBg, color: c.tooltipText }}
          />
          {/* เส้นข้อมูลหนา 2px พื้นใต้เส้นจาง 12% ปิด animation ตอนพิมพ์จะได้ไม่พิมพ์กราฟครึ่งๆ */}
          <Area
            type="monotone"
            dataKey="clicks"
            stroke={c.data}
            strokeWidth={2}
            fill={c.data}
            fillOpacity={0.12}
            activeDot={{ r: 4, stroke: c.tooltipBg, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// แท่งแนวนอนแบบ HTML เรียงจากมากไปน้อย ใส่ตัวเลขและเปอร์เซ็นต์ข้างแท่ง (อ่านค่าได้โดยไม่ต้องพึ่งสี)
export function BreakdownBars({ title, data, rename = (n) => n, limit = 10 }: { title: string; data: Breakdown; rename?: (name: string) => string; limit?: number }) {
  // ตัวจัดรูปแบบ
  const fmt = useFormat();
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // รวมทั้งหมด ใช้คำนวณเปอร์เซ็นต์
  const total = data.reduce((sum, d) => sum + d.count, 0);
  // ค่ามากสุด ใช้กำหนดความยาวแท่ง
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      {/* หัวข้อของกลุ่ม */}
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {/* ไม่มีข้อมูล */}
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">{t('common.noData')}</p>
      ) : (
        <ul className="space-y-2.5">
          {data.slice(0, limit).map((d) => (
            <li key={d.name}>
              {/* ชื่อกลุ่มซ้าย ตัวเลขขวา */}
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate">{rename(d.name)}</span>
                <span className="tabular shrink-0 text-slate-600">
                  {fmt.number(d.count)} <span className="text-slate-500">({Math.round((d.count / total) * 100)}%)</span>
                </span>
              </div>
              {/* รางของแท่ง และตัวแท่งยาวตามสัดส่วน ปลายโค้งมน */}
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-data" style={{ width: `${(d.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
