import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFormat } from '../format';
import { useI18n } from '../i18n';
import { useChartColors } from '../theme';
import type { Breakdown } from '../api';

export function DailyClicksChart({ data }: { data: { date: string; clicks: number }[] }) {
  const fmt = useFormat();
  const { t } = useI18n();
  const c = useChartColors();
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={fmt.shortDate}
            tick={{ fill: c.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: c.grid }}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: c.muted, strokeDasharray: '3 3' }}
            labelFormatter={(d) => fmt.shortDate(String(d))}
            formatter={(v) => [t('common.clicks', { n: fmt.number(Number(v)) }), t('chart.clicks')]}
            contentStyle={{ borderRadius: 10, borderColor: c.grid, background: c.tooltipBg, color: c.tooltipText }}
          />
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

export function BreakdownBars({
  title,
  data,
  rename = (n) => n,
  limit = 10,
}: {
  title: string;
  data: Breakdown;
  rename?: (name: string) => string;
  limit?: number;
}) {
  const fmt = useFormat();
  const { t } = useI18n();
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">{t('common.noData')}</p>
      ) : (
        <ul className="space-y-2.5">
          {data.slice(0, limit).map((d) => (
            <li key={d.name}>
              <div className="mb-1 flex justify-between gap-2 text-sm">
                <span className="truncate">{rename(d.name)}</span>
                <span className="tabular shrink-0 text-slate-600">
                  {fmt.number(d.count)} <span className="text-slate-500">({Math.round((d.count / total) * 100)}%)</span>
                </span>
              </div>
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
