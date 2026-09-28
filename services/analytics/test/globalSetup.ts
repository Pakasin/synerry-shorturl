import { runMigrations } from '@synerry/shared/db';

export default async function setup() {
  await runMigrations(
    process.env.TEST_DATABASE_URL ?? 'postgres://analytics_user:analytics_pass@localhost:5434/analytics_test',
  );
}
