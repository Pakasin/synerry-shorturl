import { defineConfig } from 'vitest/config';

const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://analytics_user:analytics_pass@localhost:5434/analytics_test';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: TEST_DB,
      NODE_ENV: 'test',
      INTERNAL_API_KEY: 'test-internal-key',
      IP_HASH_SALT: 'test-salt',
      STATS_TIMEZONE: 'Asia/Bangkok',
    },
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
  },
});
