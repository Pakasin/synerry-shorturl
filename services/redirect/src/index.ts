import { startService } from '@synerry/shared';
import { createApp } from './app';

startService({ name: 'redirect', defaultPort: 3002, fetch: createApp().fetch });
