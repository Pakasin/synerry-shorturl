import { Hono } from 'hono';
import { apiError, buildHealth, createLogger } from '@synerry/shared';
import { pingDb } from './db/client';
import { originCheck } from './middleware/originCheck';
import { authRoutes } from './routes/auth';
import { linkRoutes } from './routes/links';
import { statsRoutes } from './routes/stats';
import { adminRoutes } from './routes/admin';
import { internalRoutes } from './routes/internal';
import type { AppEnv } from './types';
import { secureHeaders } from 'hono/secure-headers';
import { mountFrontend } from './frontend';

const log = createLogger('gateway');

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    }),
  );

  app.get('/health', async (c) => {
    const dbUp = await pingDb();
    return c.json(buildHealth('gateway', dbUp ? 'up' : 'down'), dbUp ? 200 : 503);
  });

  app.use('/api/*', originCheck);
  app.route('/api/auth', authRoutes());
  app.route('/api/links', linkRoutes());
  app.route('/api/stats', statsRoutes());
  app.route('/api/admin', adminRoutes());
  app.route('/internal', internalRoutes());
  mountFrontend(app);

  app.notFound((c) => c.json(apiError('not_found', 'Route not found'), 404));

  app.onError((err, c) => {
    log.error('unhandled error', { path: c.req.path, message: err.message });
    return c.json(apiError('internal_error', 'Something went wrong'), 500);
  });

  return app;
}
