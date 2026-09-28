import { runMigrations } from '@synerry/shared/db';

export default async function setup() {
  await runMigrations(
    process.env.TEST_DATABASE_URL ?? 'postgres://gateway_user:gateway_pass@localhost:5434/gateway_test',
  );
}
