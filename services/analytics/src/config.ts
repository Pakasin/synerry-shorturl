export const config = {
  internalApiKey: process.env.INTERNAL_API_KEY,
  ipHashSalt: process.env.IP_HASH_SALT ?? 'dev-salt-change-me',
  timezone: process.env.STATS_TIMEZONE ?? 'Asia/Bangkok',
};
