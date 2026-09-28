import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function createPool(url: string) {
  return postgres(url, { max: 5, connect_timeout: 5, idle_timeout: 20 });
}

export async function ping(sql: postgres.Sql): Promise<boolean> {
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function runMigrations(url: string, migrationsFolder = './drizzle'): Promise<void> {
  const conn = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(conn), { migrationsFolder });
  } finally {
    await conn.end();
  }
}
