import path from 'node:path';
import { getDb, closeDb, dataDir } from '../lib/server/db';
import { passwordHash } from '../lib/server/auth';
import { uuid } from '../lib/server/core';

async function setup() {
  const expected = path.resolve('.data/e2e');
  if (process.env.DATABASE_URL || dataDir() !== expected) {
    throw new Error('Las pruebas solo pueden usar la base local aislada .data/e2e.');
  }
  const db = await getDb();
  const password = await passwordHash('E2e-Prueba-Sergod-2026!');
  // The complete suite exceeds one account's login allowance. Give the
  // tournament journey its own isolated admin without weakening real limits.
  for (const email of ['e2e@example.test', 'e2e-tournaments@example.test']) {
    await db.query(
      `INSERT INTO users(id,email,password_hash,name,role,email_verified)
     VALUES($1,$2,$3,'Administrador E2E','admin',true)
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role='admin',email_verified=true`,
      [uuid(), email, password],
    );
  }
  await db.query(
    "DELETE FROM rate_limits WHERE key IN ('login:e2e@example.test', 'login:e2e-tournaments@example.test') OR key LIKE 'auth-ip:%'",
  );
  console.log(
    'Administrador de pruebas listo en .data/e2e. La base principal permanece independiente.',
  );
}

setup()
  .finally(closeDb)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
