import { requireEnv, runMigrations } from '@synerry/shared/db';

await runMigrations(requireEnv('DATABASE_URL'));
console.log('[gateway] migrations applied');
