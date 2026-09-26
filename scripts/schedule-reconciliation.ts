import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';
import { databasePoolConfig, databaseSchema } from '../lib/server/database-config';

loadEnvConfig(process.cwd());
async function main() {
  const base = new URL(process.env.APP_URL || '');
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash)
    throw new Error('APP_URL debe ser un origen HTTPS sin ruta.');
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
    throw new Error('Configura CRON_SECRET de al menos 32 caracteres.');
  const schema = databaseSchema();
  const pool = new Pool({ ...databasePoolConfig(), max: 1 });
  const client = await pool.connect();
  const name = `${schema}_reconcile`;
  try {
    await client.query('BEGIN');
    const extensions = (
      await client.query(
        "SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net','supabase_vault')",
      )
    ).rows;
    if (extensions.length !== 3)
      throw new Error('Habilita pg_cron, pg_net y Supabase Vault antes de programar.');
    for (const [secretName, value] of [
      [`${schema}_app_url`, base.origin],
      [`${schema}_cron_secret`, process.env.CRON_SECRET],
    ]) {
      const existing = (
        await client.query('SELECT id FROM vault.secrets WHERE name=$1', [secretName])
      ).rows[0];
      if (existing) await client.query('SELECT vault.update_secret($1,$2)', [existing.id, value]);
      else
        await client.query('SELECT vault.create_secret($1,$2,$3)', [
          value,
          secretName,
          'Mantenimiento SERGOD STORE',
        ]);
    }
    // Only validated schema identifiers enter these Vault key names. The job
    // stores references; the bearer credential never appears in cron.job.
    const command = `SELECT net.http_get(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='${schema}_app_url') || '/api/jobs/reconcile',
      headers := jsonb_build_object('Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='${schema}_cron_secret')),
      timeout_milliseconds := 55000
    )`;
    const job = (
      await client.query('SELECT cron.schedule($1,$2,$3) AS id', [name, '* * * * *', command])
    ).rows[0];
    await client.query('COMMIT');
    const probe = (await client.query(command)).rows[0];
    console.log(
      JSON.stringify({
        job: name,
        id: job.id,
        schedule: 'cada minuto',
        probeRequestId: probe.http_get,
      }),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'No se pudo programar la conciliación.');
  process.exitCode = 1;
});
