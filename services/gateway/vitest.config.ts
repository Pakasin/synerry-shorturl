import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://gateway_user:gateway_pass@localhost:5434/gateway_test';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: TEST_DB,
      NODE_ENV: 'test',
      INTERNAL_API_KEY: 'test-internal-key',
      SHORT_BASE_URL: 'http://localhost:3002',
      ANALYTICS_URL: 'http://127.0.0.1:9',
    },
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
  },
});
