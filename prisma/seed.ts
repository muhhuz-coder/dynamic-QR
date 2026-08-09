import { config } from 'dotenv';

// Static imports of ../src/lib/* are hoisted above this, so anything that reads
// process.env.DATABASE_URL at module-load time (the Prisma client singleton) must
// be dynamically imported below, after env vars are actually loaded.
// Snapshot + restore shell-exported vars afterward: dotenv's override:true would
// otherwise clobber a value like `$env:DATABASE_URL = "<prod>"` set deliberately
// in the shell (e.g. for a one-off prod seed run) with whatever .env.local has
// for local dev — silently seeding the wrong database instead of erroring.
const shellEnv = { ...process.env };
config();
config({ path: '.env.local', override: true });
Object.assign(process.env, shellEnv);

async function main() {
  const { hashPassword } = await import('../src/lib/auth/password');
  const { db } = await import('../src/lib/db/client');

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set');
  }

  try {
    const existing = await db.admin.findUnique({ where: { email } });
    if (existing) {
      console.log(`Admin ${email} already exists, skipping.`);
      return;
    }

    const passwordHash = await hashPassword(password);
    const admin = await db.admin.create({
      data: { email, passwordHash, role: 'admin' },
    });

    console.log(`Seeded admin ${admin.email} (${admin.id})`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
