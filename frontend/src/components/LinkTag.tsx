// นำเข้า ref ของ React
import { useRef, type ReactNode } from 'react';
// นำเข้าตัวสร้าง QR Code แบบ canvas (ใช้ทำ PNG) และแบบ SVG (ใช้ทำไฟล์ SVG ที่ขยายได้ไม่แตก)
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
// นำเข้าชนิดข้อมูลลิงก์
import type { Link } from '../api';
// นำเข้าฟังก์ชันแปล
import { useI18n } from '../i18n';
// นำเข้าปุ่มคัดลอกและป้ายสถานะ
import { CopyButton, StatusBadge } from './ui';

// ขนาด QR บนหน้าจอ (px)
const QR_SIZE = 168;

// class ของปุ่มรองในป้าย
export const tagButton = 'rounded-[10px] border border-line px-3 py-1.5 text-sm font-medium hover:bg-mist';

// ดาวน์โหลดไฟล์จาก URL โดยสร้างลิงก์ชั่วคราวแล้วกด
function download(href: string, filename: string) {
  // สร้างแท็ก a
  const a = document.createElement('a');
  // ตั้งปลายทาง
  a.href = href;
  // ตั้งชื่อไฟล์
  a.download = filename;
  // กดเพื่อดาวน์โหลด
  a.click();
}

// ตัดโปรโตคอลออกจาก URL ให้อ่านง่ายบนป้าย (https://www.synerry.com/ -> www.synerry.com)
const displayUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

// ป้ายลิงก์: ชิ้นหลักของเว็บ แสดง QR ลิงก์สั้นตัวใหญ่ และปลายทาง ขอบเส้นประแบบป้ายที่ฉีกออกไปใช้ได้
// showTitle: หน้าที่มีชื่อลิงก์เป็นหัวข้ออยู่แล้วให้ปิด ไม่งั้นชื่อซ้ำสองที่
export function LinkTag({ link, extraActions, animate = false, showTitle = true }: { link: Link; extraActions?: ReactNode; animate?: boolean; showTitle?: boolean }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // อ้างอิง canvas ที่วาด QR ไว้
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // อ้างอิง SVG ที่ซ่อนไว้ ใช้ตอนดาวน์โหลด SVG
  const svgRef = useRef<SVGSVGElement>(null);

  // ดาวน์โหลดเป็น PNG จาก canvas
  const downloadPng = () => {
    // ไม่มี canvas ไม่ต้องทำ
    if (!canvasRef.current) return;
    // แปลง canvas เป็นรูป PNG แล้วดาวน์โหลด
    download(canvasRef.current.toDataURL('image/png'), `qr-${link.shortCode}.png`);
  };

  // ดาวน์โหลดเป็น SVG
  const downloadSvg = () => {
    // ไม่มี SVG ไม่ต้องทำ
    if (!svgRef.current) return;
    // แปลง element เป็นข้อความ SVG
    const text = new XMLSerializer().serializeToString(svgRef.current);
    // สร้างไฟล์ชั่วคราวในหน่วยความจำ
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    // ดาวน์โหลด
    download(url, `qr-${link.shortCode}.svg`);
    // คืนหน่วยความจำหลังดาวน์โหลดเริ่มแล้ว (ถ้าคืนทันที บาง browser จะดาวน์โหลดไม่สำเร็จ)
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      className={`link-tag grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:gap-0 sm:p-0 ${animate ? 'tag-enter' : ''}`}
      // ตำแหน่งรูเจาะ = ความกว้างช่อง QR (QR + ระยะขอบซ้ายขวา)
      style={{ ['--notch-x' as string]: `${QR_SIZE + 48}px` }}
    >
      {/* ช่อง QR ด้านซ้าย มีเส้นประแบ่งกับข้อความ (จอแคบอยู่ด้านบน) */}
      <div className="flex justify-center sm:border-r-2 sm:border-dashed sm:border-line sm:p-6">
        {/* QR พื้นขาวดำเสมอแม้ในโหมดมืด แอปสแกนบางตัวอ่าน QR สีกลับด้านไม่ได้ ระดับแก้ไขข้อผิดพลาด M มีขอบขาว 2 ช่อง */}
        <QRCodeCanvas
          ref={canvasRef}
          value={link.shortUrl}
          size={QR_SIZE * 2}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#000000"
          className="rounded-lg"
          style={{ width: QR_SIZE, height: QR_SIZE }}
          aria-label={t('qr.alt', { url: link.shortUrl })}
        />
        {/* SVG ซ่อนไว้ ใช้สำหรับดาวน์โหลดเท่านั้น */}
        <QRCodeSVG ref={svgRef} value={link.shortUrl} size={512} level="M" marginSize={2} className="hidden" />
      </div>

      {/* ข้อมูลลิงก์ด้านขวา */}
      <div className="flex min-w-0 flex-col justify-center gap-3 sm:p-6">
        {/* สถานะและชื่อเรียก */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={link.status} />
          {showTitle && link.title && <span className="truncate font-medium text-slate-600">{link.title}</span>}
        </div>
        {/* ลิงก์สั้นตัวใหญ่ เป็นสิ่งแรกที่สายตาเห็น */}
        <a
          href={link.shortUrl}
          target="_blank"
          rel="noreferrer"
          className="tabular break-all text-2xl font-bold leading-tight text-brand hover:underline sm:text-[1.75rem]"
        >
          {displayUrl(link.shortUrl)}
        </a>
        {/* ปลายทาง */}
        <p className="break-all text-sm text-slate-500">
          {t('shorten.goesTo')} <span className="text-slate-700">{displayUrl(link.originalUrl)}</span>
        </p>
        {/* ปุ่ม: คัดลอกเป็นปุ่มหลัก ที่เหลือเป็นปุ่มรอง (ไม่พิมพ์ตอนพิมพ์รายงาน) */}
        <div className="flex flex-wrap gap-2 pt-1 print:hidden">
          <CopyButton text={link.shortUrl} primary />
          <a href={link.shortUrl} target="_blank" rel="noreferrer" className={tagButton}>{t('common.open')}</a>
          <button type="button" onClick={downloadPng} className={tagButton}>{t('qr.png')}</button>
          <button type="button" onClick={downloadSvg} className={tagButton}>{t('qr.svg')}</button>
          {extraActions}
        </div>
      </div>
    </div>
  );
}
