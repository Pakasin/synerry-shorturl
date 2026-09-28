import { Hono, type Context } from 'hono';
import { buildHealth, clientIp, createLogger } from '@synerry/shared';
import { config } from './config';
import { lookupLink, recordClick } from './upstream';
import { renderPage, type PageKind } from './pages';

const log = createLogger('redirect');

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,30}$/;

function errorPage(c: Context, kind: PageKind, status: 403 | 404 | 410 | 503) {
  c.header('Cache-Control', 'no-store');
  return c.html(renderPage(kind), status);
}

export function createApp() {
  const app = new Hono();

  app.get('/health', (c) => c.json(buildHealth('redirect', 'none')));

  app.get('/', (c) => c.redirect(config.appUrl, 302));

  app.get('/:code', async (c) => {
    const code = c.req.param('code');
    if (!CODE_PATTERN.test(code)) return errorPage(c, 'not_found', 404);

    const result = await lookupLink(code);
    if (result.kind === 'not_found') return errorPage(c, 'not_found', 404);
    if (result.kind === 'unavailable') {
      log.error('lookup failed', { code, reason: result.reason });
      return errorPage(c, 'unavailable', 503);
    }
    const link = result.link;
    if (!link.isActive) return errorPage(c, 'disabled', 410);
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return errorPage(c, 'expired', 410);
    if (link.startsAt && new Date(link.startsAt).getTime() > Date.now()) return errorPage(c, 'scheduled', 403);
    if (link.blocked) return errorPage(c, 'blocked', 410);
    if (!/^https?:\/\//i.test(link.originalUrl)) return errorPage(c, 'not_found', 404);

    if (c.req.method === 'GET') {
      const saved = await recordClick({
        linkId: link.id,
        clickedAt: new Date().toISOString(),
        ip: clientIp(c),
        userAgent: c.req.header('user-agent'),
        referer: c.req.header('referer'),
      });
      if (!saved.ok) log.warn('click not recorded', { code, linkId: link.id, reason: saved.reason });
    }

    c.header('Cache-Control', 'no-store');
    return c.redirect(link.originalUrl, 302);
  });

  app.notFound((c) => errorPage(c, 'not_found', 404));

  app.onError((err, c) => {
    log.error('unhandled error', { path: c.req.path, message: err.message });
    return errorPage(c, 'unavailable', 503);
  });

  return app;
}
