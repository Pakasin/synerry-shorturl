import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      GATEWAY_URL: 'http://gateway.test',
      ANALYTICS_URL: 'http://analytics.test',
      APP_URL: 'http://app.test',
      INTERNAL_API_KEY: 'test-internal-key',
      CLICK_TIMEOUT_MS: '200',
      LOOKUP_TIMEOUT_MS: '200',
    },
  },
});
