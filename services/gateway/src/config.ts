export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  sessionCookieName: 'sid',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  allowedOrigins: [
    process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:3001',
    process.env.RENDER_EXTERNAL_URL ?? '',
  ]
    .join(',')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  shortBaseUrl: (process.env.SHORT_BASE_URL ?? 'http://localhost:3002').replace(/\/+$/, ''),
  internalApiKey: process.env.INTERNAL_API_KEY,
  analyticsUrl: (process.env.ANALYTICS_URL ?? 'http://localhost:3003').replace(/\/+$/, ''),
  analyticsTimeoutMs: Number(process.env.ANALYTICS_TIMEOUT_MS ?? 3000),
};
