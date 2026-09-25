import { loadEnvConfig } from '@next/env';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
loadEnvConfig(process.cwd());
async function main() {
  const { getDb, closeDb, dataDir } = await import('../lib/server/db');
  const { passwordHash, passwordSchema } = await import('../lib/server/auth');
  const { uuid, token, isProd } = await import('../lib/server/core');
  const remote = Boolean(process.env.DATABASE_URL) || isProd();
  const email = (process.env.ADMIN_EMAIL || (!remote ? 'admin@sergod.local' : ''))
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Configura ADMIN_EMAIL.');
  const password = process.env.ADMIN_PASSWORD || (!remote ? token().slice(0, 24) : '');
  passwordSchema.parse(password);
  const db = await getDb();
  if ((await db.query('SELECT id FROM users WHERE email=$1', [email])).rows.length)
    throw new Error(
      'Ese correo ya existe. Usa recuperación de contraseña; el script no sobrescribe usuarios.',
    );
  await db.query(
    "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,$3,'Administrador','admin',true)",
    [uuid(), email, await passwordHash(password)],
  );
  if (!remote) {
    await mkdir(dataDir(), { recursive: true });
    const file = path.join(dataDir(), 'initial-access.txt');
    await writeFile(
      file,
      `Acceso local de desarrollo — no publicar\nURL: http://localhost:3000/admin\nCorreo: ${email}\nContraseña: ${password}\n`,
    );
    console.log(`Administrador creado. Acceso guardado en ${file}`);
  } else console.log('Administrador creado.');
  await closeDb();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
