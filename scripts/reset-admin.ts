// One-off: delete an admin row by email so prisma:seed can recreate it cleanly.
// Run with DATABASE_URL set to the target database in your shell env.
async function main() {
  const { db } = await import('../src/lib/db/client');
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) throw new Error('Set SEED_ADMIN_EMAIL to the admin email you want to delete');

  const deleted = await db.admin.deleteMany({ where: { email } });
  console.log(`Deleted ${deleted.count} admin(s) with email ${email}`);
  await db.$disconnect();
}

main();
