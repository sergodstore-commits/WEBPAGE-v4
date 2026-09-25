import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { getDb, migrate, closeDb } = await import('../lib/server/db');
  const db = await getDb();
  await migrate(db);
  console.log('Migraciones aplicadas.');
  await closeDb();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
