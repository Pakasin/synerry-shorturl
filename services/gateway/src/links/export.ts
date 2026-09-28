import { and, desc, eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '../db/client';
import { links } from '../db/schema';
import { loadClickCounts } from '../services/analytics';
import { toCsv } from './csv';
import { toLinkDto } from './dto';
import { notDeleted } from './queries';

const EXPORT_LIMIT = 10_000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_FORMAT = 'yyyy-mm-dd hh:mm';

type ExportRow = ReturnType<typeof toLinkDto> & { clicks: number | null };

export async function loadExportRows(userId: number): Promise<ExportRow[]> {
  const rows = await db
    .select()
    .from(links)
    .where(and(eq(links.userId, userId), notDeleted))
    .orderBy(desc(links.createdAt), desc(links.id))
    .limit(EXPORT_LIMIT);
  const clicks = await loadClickCounts(rows.map((l) => l.id));
  return rows.map((l) => ({ ...toLinkDto(l), clicks: clicks.of(l.id) }));
}

export const exportFilename = (ext: 'csv' | 'xlsx') => `synerry-links-${new Date().toISOString().slice(0, 10)}.${ext}`;

export function buildCsv(rows: ExportRow[]): string {
  return toCsv(
    ['Short URL', 'Original URL', 'Title', 'Tags', 'Status', 'Clicks', 'Created At', 'Starts At', 'Expires At'],
    rows.map((d) => [
      d.shortUrl,
      d.originalUrl,
      d.title,
      d.tags.join(', '),
      d.status,
      d.clicks ?? '',
      d.createdAt,
      d.startsAt,
      d.expiresAt,
    ]),
  );
}

const toBangkok = (d: Date | null) => (d ? new Date(d.getTime() + BANGKOK_OFFSET_MS) : null);

export async function buildXlsx(rows: ExportRow[]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Synerry Short URL';
  const sheet = workbook.addWorksheet('Links', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Short URL', key: 'shortUrl', width: 32 },
    { header: 'Original URL', key: 'originalUrl', width: 50 },
    { header: 'Title', key: 'title', width: 28 },
    { header: 'Tags', key: 'tags', width: 20 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Clicks', key: 'clicks', width: 9 },
    { header: 'Created At (TH)', key: 'createdAt', width: 18, style: { numFmt: DATE_FORMAT } },
    { header: 'Starts At (TH)', key: 'startsAt', width: 18, style: { numFmt: DATE_FORMAT } },
    { header: 'Expires At (TH)', key: 'expiresAt', width: 18, style: { numFmt: DATE_FORMAT } },
  ];
  for (const d of rows) {
    sheet.addRow({
      shortUrl: { text: d.shortUrl, hyperlink: d.shortUrl },
      originalUrl: d.originalUrl,
      title: d.title ?? '',
      tags: d.tags.join(', '),
      status: d.status,
      clicks: d.clicks,
      createdAt: toBangkok(d.createdAt),
      startsAt: toBangkok(d.startsAt),
      expiresAt: toBangkok(d.expiresAt),
    });
  }
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2340' } };
  sheet.autoFilter = { from: 'A1', to: 'I1' };
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}
