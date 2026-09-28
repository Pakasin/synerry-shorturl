import { createLogger, startService } from '@synerry/shared';
import { createApp } from './app';
import { sql } from './db/client';
import { refreshBlocklist } from './links/blocklist';

await refreshBlocklist().catch((err: Error) =>
  createLogger('gateway').warn('could not load blocklist from database', { message: err.message }),
);

startService({
  name: 'gateway',
  defaultPort: 3001,
  fetch: createApp().fetch,
  onShutdown: () => sql.end({ timeout: 5 }),
});
