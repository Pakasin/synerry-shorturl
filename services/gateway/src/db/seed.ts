import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, sql } from './client';
import { links, users } from './schema';

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'Demo@1234';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@1234';

const DEMO_LINKS = [
  {
    originalUrl: 'https://www.synerry.com/',
    shortCode: 'synerry',
    title: 'Synerry Corporation',
    tags: ['Synerry', 'เว็บไซต์'],
  },
  { originalUrl: 'https://github.com/', shortCode: 'Gh7kQ2', title: 'GitHub', tags: ['Dev'] },
  {
    originalUrl: 'https://www.google.com/',
    shortCode: 'Off9xP',
    title: 'Disabled example',
    isActive: false,
    tags: [] as string[],
  },
  {
    originalUrl: 'https://www.synerry.com/th/',
    shortCode: 'launch',
    title: 'Scheduled example',
    startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    tags: ['Synerry'],
  },
];

try {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await db
    .insert(users)
    .values({ username: DEMO_USERNAME, passwordHash })
    .onConflictDoUpdate({
      target: users.username,
      set: { passwordHash, isActive: true, role: 'user', onboardedAt: null },
    });

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await db
    .insert(users)
    .values({ username: ADMIN_USERNAME, passwordHash: adminHash, role: 'admin' })
    .onConflictDoUpdate({
      target: users.username,
      set: { passwordHash: adminHash, isActive: true, role: 'admin', onboardedAt: null },
    });

  const [demo] = await db.select({ id: users.id }).from(users).where(eq(users.username, DEMO_USERNAME));

  for (const l of DEMO_LINKS) {
    await db
      .insert(links)
      .values({ ...l, userId: demo.id })
      .onConflictDoUpdate({
        target: links.shortCode,
        set: {
          originalUrl: l.originalUrl,
          title: l.title,
          tags: l.tags,
          isActive: l.isActive ?? true,
          startsAt: l.startsAt ?? null,
          expiresAt: null,
          deletedAt: null,
        },
      });
  }

  console.log(`[gateway] seed done: user "${DEMO_USERNAME}" (id ${demo.id}), demo links: ${DEMO_LINKS.length}`);
} finally {
  await sql.end();
}
