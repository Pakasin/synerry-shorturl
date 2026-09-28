import { bigserial, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const clicks = pgTable(
  'clicks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    linkId: integer('link_id').notNull(),
    clickedAt: timestamp('clicked_at', { withTimezone: true }).notNull().defaultNow(),
    ipHash: varchar('ip_hash', { length: 64 }),
    userAgent: text('user_agent'),
    referer: text('referer'),
    deviceType: varchar('device_type', { length: 20 }),
    browser: varchar('browser', { length: 50 }),
    os: varchar('os', { length: 50 }),
    country: varchar('country', { length: 2 }),
  },
  (t) => [index('clicks_link_time_idx').on(t.linkId, t.clickedAt)],
);

export type Click = typeof clicks.$inferSelect;
