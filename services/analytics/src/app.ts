import { Hono } from 'hono';
import { apiError, buildHealth, createLogger } from '@synerry/shared';
import { pingDb } from './db/client';
import { internalRoutes } from './routes/internal';

const log = createLogger('analytics');

export function createApp() {
  const app = new Hono();

  app.get('/health', async (c) => {
    const dbUp = await pingDb();
    return c.json(buildHealth('analytics', dbUp ? 'up' : 'down'), dbUp ? 200 : 503);
  });

  app.route('/internal', internalRoutes());

  app.notFound((c) => c.json(apiError('not_found', 'Route not found'), 404));

  app.onError((err, c) => {
    log.error('unhandled error', { path: c.req.path, message: err.message });
    return c.json(apiError('internal_error', 'Something went wrong'), 500);
  });

  return app;
}
