import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { apiError, createLogger } from '@synerry/shared';

const log = createLogger('gateway');

const API_PATH = /^\/(api|internal)(\/|$)/;

export function mountFrontend(app: Hono<any>) {
  const root = resolve(process.env.FRONTEND_DIST ?? '../../frontend/dist');
  const indexFile = join(root, 'index.html');
  if (!existsSync(indexFile)) {
    log.info('frontend build not found, not serving the web app', { root });
    return;
  }
  const indexHtml = readFileSync(indexFile, 'utf8');
  log.info('serving web app', { root });

  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', serveStatic({ root }));

  app.get('*', (c) => {
    if (API_PATH.test(c.req.path)) return c.json(apiError('not_found', 'Route not found'), 404);
    c.header('Cache-Control', 'no-cache');
    return c.html(indexHtml);
  });
}
