import { drizzle } from 'drizzle-orm/postgres-js';
import { createPool, ping, requireEnv } from '@synerry/shared/db';
import * as schema from './schema';

export const sql = createPool(requireEnv('DATABASE_URL'));
export const db = drizzle(sql, { schema });
export const pingDb = () => ping(sql);
