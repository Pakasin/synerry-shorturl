import { boolean, index, integer, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 30 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 10 }).notNull().default('user'),
  isActive: boolean('is_active').notNull().default(true),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const links = pgTable(
  'links',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalUrl: text('original_url').notNull(),
    shortCode: varchar('short_code', { length: 30 }).notNull().unique(),
    title: varchar('title', { length: 200 }),
    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockReason: varchar('lock_reason', { length: 300 }),
    lockedBy: integer('locked_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('links_user_created_idx').on(t.userId, t.createdAt), index('links_tags_idx').using('gin', t.tags)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const blockedDomains = pgTable('blocked_domains', {
  id: serial('id').primaryKey(),
  domain: varchar('domain', { length: 253 }).notNull().unique(),
  reason: varchar('reason', { length: 300 }),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Link = typeof links.$inferSelect;
