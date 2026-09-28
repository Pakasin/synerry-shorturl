import { sql } from './db/client';
import { config } from './config';

type Breakdown = { name: string; count: number }[];

export async function getLinkStats(linkId: number, days: number) {
  const tz = config.timezone;

  const totalsQuery = sql<{ total: number; uniq: number; last: Date | null; bots: number }[]>`
    select
      count(*) filter (where device_type is distinct from 'bot')::int as total,
      count(distinct ip_hash) filter (where device_type is distinct from 'bot')::int as uniq,
      max(clicked_at) filter (where device_type is distinct from 'bot') as last,
      count(*) filter (where device_type = 'bot')::int as bots
    from clicks where link_id = ${linkId}`;

  const dailyQuery = sql<{ date: string; clicks: number }[]>`
    select to_char(d, 'YYYY-MM-DD') as date, count(c.id)::int as clicks
    from generate_series(
      (now() at time zone ${tz})::date - ${days - 1}::int,
      (now() at time zone ${tz})::date,
      interval '1 day'
    ) as d
    left join clicks c
      on c.link_id = ${linkId}
      and c.device_type is distinct from 'bot'
      and (c.clicked_at at time zone ${tz})::date = d::date
    group by d order by d`;

  const breakdown = (column: 'device_type' | 'browser' | 'os') => sql<Breakdown>`
    select coalesce(${sql(column)}, 'Unknown') as name, count(*)::int as count
    from clicks
    where link_id = ${linkId}
      and device_type is distinct from 'bot'
      and clicked_at >= now() - make_interval(days => ${days})
    group by 1 order by 2 desc, 1 limit 10`;

  const referersQuery = sql<Breakdown>`
    select coalesce(substring(referer from '^https?://([^/:?#]+)'), 'Direct') as name, count(*)::int as count
    from clicks
    where link_id = ${linkId}
      and device_type is distinct from 'bot'
      and clicked_at >= now() - make_interval(days => ${days})
    group by 1 order by 2 desc, 1 limit 10`;

  const countriesQuery = sql<Breakdown>`
    select coalesce(country, 'Unknown') as name, count(*)::int as count
    from clicks
    where link_id = ${linkId}
      and device_type is distinct from 'bot'
      and clicked_at >= now() - make_interval(days => ${days})
    group by country order by 2 desc, country is null, country`;

  const recentQuery = sql<
    {
      clickedAt: Date;
      deviceType: string;
      browser: string | null;
      os: string | null;
      referer: string | null;
      country: string | null;
    }[]
  >`
    select clicked_at as "clickedAt", device_type as "deviceType", browser, os, referer, country
    from clicks
    where link_id = ${linkId} and device_type is distinct from 'bot'
    order by clicked_at desc limit 10`;

  const [[totals], daily, devices, browsers, os, referers, countries, recent] = await Promise.all([
    totalsQuery,
    dailyQuery,
    breakdown('device_type'),
    breakdown('browser'),
    breakdown('os'),
    referersQuery,
    countriesQuery,
    recentQuery,
  ]);

  return {
    days,
    totalClicks: totals.total,
    uniqueVisitors: totals.uniq,
    lastClickAt: totals.last,
    botClicks: totals.bots,
    daily,
    devices,
    countries,
    browsers,
    os,
    referers,
    recent,
  };
}

export async function getClickCounts(linkIds: number[]): Promise<Record<string, number>> {
  if (linkIds.length === 0) return {};
  const rows = await sql<{ linkId: number; count: number }[]>`
    select link_id as "linkId", count(*)::int as count
    from clicks
    where link_id = any(${linkIds}::int[]) and device_type is distinct from 'bot'
    group by link_id`;
  const counts: Record<string, number> = Object.fromEntries(linkIds.map((id) => [String(id), 0]));
  for (const row of rows) counts[String(row.linkId)] = row.count;
  return counts;
}
