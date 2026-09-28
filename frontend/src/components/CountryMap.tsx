import { useMemo, useState } from 'react';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import world from 'world-atlas/countries-110m.json';
import { alpha2ToNumeric, useFormat } from '../format';
import { useI18n } from '../i18n';
import { useChartColors } from '../theme';
import type { Breakdown } from '../api';

const WIDTH = 800;
const HEIGHT = 390;

const COUNTRIES = (
  feature(
    world as unknown as Topology,
    (world as unknown as Topology).objects.countries as GeometryCollection,
  ) as unknown as {
    features: Feature<Geometry, { name: string }>[];
  }
).features.filter((f) => f.id !== '010');

const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features: COUNTRIES });
const pathOf = geoPath(projection);
const PATHS = COUNTRIES.map((f) => ({ id: String(f.id ?? ''), d: pathOf(f) ?? '' }));

export function CountryMap({ data }: { data: Breakdown }) {
  const fmt = useFormat();
  const { t } = useI18n();
  const c = useChartColors();
  const [hover, setHover] = useState<{ code: string; count: number; x: number; y: number } | null>(null);

  const byNumeric = useMemo(() => {
    const m = new Map<string, { code: string; count: number }>();
    for (const d of data) {
      const numeric = d.name !== 'Unknown' ? alpha2ToNumeric(d.name) : undefined;
      if (numeric) m.set(numeric, { code: d.name, count: d.count });
    }
    return m;
  }, [data]);

  const max = Math.max(1, ...[...byNumeric.values()].map((v) => v.count));

  const colorOf = (count: number) => {
    if (count <= 0) return c.mapEmpty;
    const ratio = Math.sqrt(count / max);
    return c.mapRamp[Math.min(c.mapRamp.length - 1, Math.floor(ratio * c.mapRamp.length))];
  };

  const legendStops = c.mapRamp.map((color, i) => ({
    color,
    from: Math.max(1, Math.ceil(max * (i / c.mapRamp.length) ** 2)),
  }));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={t('detail.countries')}
        onMouseLeave={() => setHover(null)}
      >
        {PATHS.map((p) => {
          const v = byNumeric.get(p.id);
          return (
            <path
              key={p.id + p.d.length}
              d={p.d}
              fill={colorOf(v?.count ?? 0)}
              stroke={c.mapStroke}
              strokeWidth={0.5}
              onMouseMove={(e) => {
                if (!v) return setHover(null);
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ ...v, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
            />
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-sm shadow-md"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {t('map.tooltip', { name: fmt.country(hover.code), n: fmt.number(hover.count) })}
        </div>
      )}

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
