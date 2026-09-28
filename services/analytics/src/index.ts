import { startService } from '@synerry/shared';
import { createApp } from './app';
import { sql } from './db/client';

startService({
  name: 'analytics',
  defaultPort: 3003,
  fetch: createApp().fetch,
  onShutdown: () => sql.end({ timeout: 5 }),
});
