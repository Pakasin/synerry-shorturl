import { useRef, type ReactNode } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import type { Link } from '../api';
import { useI18n } from '../i18n';
import { buttonCls } from './styles';
import { CopyButton, StatusBadge } from './ui';

const QR_SIZE = 168;

function download(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

const displayUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

export function LinkTag({
  link,
  extraActions,
  animate = false,
  showTitle = true,
}: {
  link: Link;
  extraActions?: ReactNode;
  animate?: boolean;
  showTitle?: boolean;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const downloadPng = () => {
    if (!canvasRef.current) return;
    download(canvasRef.current.toDataURL('image/png'), `qr-${link.shortCode}.png`);
  };

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const text = new XMLSerializer().serializeToString(svgRef.current);
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    download(url, `qr-${link.shortCode}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      className={`link-tag grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:gap-0 sm:p-0 ${animate ? 'tag-enter' : ''}`}
      style={{ ['--notch-x' as string]: `${QR_SIZE + 48}px` }}
    >
      <div className="flex justify-center sm:border-r-2 sm:border-dashed sm:border-line sm:p-6">
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
        <QRCodeSVG ref={svgRef} value={link.shortUrl} size={512} level="M" marginSize={2} className="hidden" />
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={link.status} />
          {showTitle && link.title && <span className="truncate font-medium text-slate-600">{link.title}</span>}
        </div>
        <a
          href={link.shortUrl}
          target="_blank"
          rel="noreferrer"
          className="tabular break-all text-2xl font-bold leading-tight text-brand hover:underline sm:text-[1.75rem]"
        >
          {displayUrl(link.shortUrl)}
        </a>
        <p className="break-all text-sm text-slate-500">
          {t('shorten.goesTo')} <span className="text-slate-700">{displayUrl(link.originalUrl)}</span>
        </p>
        <div className="flex flex-wrap gap-2 pt-1 print:hidden">
          <CopyButton text={link.shortUrl} primary />
          <a href={link.shortUrl} target="_blank" rel="noreferrer" className={buttonCls()}>
            {t('common.open')}
          </a>
          <button type="button" onClick={downloadPng} className={buttonCls()}>
            {t('qr.png')}
          </button>
          <button type="button" onClick={downloadSvg} className={buttonCls()}>
            {t('qr.svg')}
          </button>
          {extraActions}
        </div>
      </div>
    </div>
  );
}
