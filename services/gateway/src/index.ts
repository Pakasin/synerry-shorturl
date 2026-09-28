import { createLogger, startService } from '@synerry/shared';
import { createApp } from './app';
import { sql } from './db/client';
import { refreshBlocklist, refreshFeedBlocklist } from './links/blocklist';

const logger = createLogger('gateway');
const FEED_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

await refreshBlocklist().catch((err: Error) =>
  logger.warn('could not load blocklist from database', { message: err.message }),
);

refreshFeedBlocklist().catch((err: Error) =>
  logger.warn('could not load threat feed blocklist', { message: err.message }),
);
setInterval(() => {
  refreshFeedBlocklist().catch((err: Error) =>
    logger.warn('could not refresh threat feed blocklist', { message: err.message }),
  );
}, FEED_REFRESH_INTERVAL_MS);

startService({
  name: 'gateway',
  defaultPort: 3001,
  fetch: createApp().fetch,
  onShutdown: () => sql.end({ timeout: 5 }),
});
