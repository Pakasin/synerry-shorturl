const trimSlash = (url: string) => url.replace(/\/+$/, '');

export const config = {
  gatewayUrl: trimSlash(process.env.GATEWAY_URL ?? 'http://localhost:3001'),
  analyticsUrl: trimSlash(process.env.ANALYTICS_URL ?? 'http://localhost:3003'),
  appUrl: trimSlash(process.env.APP_URL ?? 'http://localhost:5173'),
  internalApiKey: process.env.INTERNAL_API_KEY ?? '',
  lookupTimeoutMs: Number(process.env.LOOKUP_TIMEOUT_MS ?? 3000),
  clickTimeoutMs: Number(process.env.CLICK_TIMEOUT_MS ?? 1500),
};
