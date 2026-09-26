import { loadEnvConfig } from '@next/env';
import { databasePoolConfig, databaseSchema } from '../lib/server/database-config';
loadEnvConfig(process.cwd());
const required = [
  'APP_URL',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'SMTP_HOST',
  'MAIL_FROM',
  'CRON_SECRET',
];
const errors = required.filter((key) => !process.env[key]).map((key) => `Falta ${key}`);
try {
  databaseSchema();
  if (process.env.DATABASE_URL) databasePoolConfig();
} catch (error) {
  errors.push(error instanceof Error ? error.message : 'Configuración PostgreSQL no válida');
}
for (const key of ['APP_URL', 'SUPABASE_URL'])
  if (process.env[key]) {
    try {
      if (new URL(process.env[key]!).protocol !== 'https:') errors.push(`${key} debe usar HTTPS`);
    } catch {
      errors.push(`${key} no es una URL válida`);
    }
  }
if (process.env.DATABASE_SSL === 'false')
  errors.push('DATABASE_SSL no puede ser false en producción');
if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32)
  errors.push('CRON_SECRET debe tener al menos 32 caracteres aleatorios');
if (process.env.FLOW_ENV && !['sandbox', 'production'].includes(process.env.FLOW_ENV))
  errors.push('FLOW_ENV debe ser sandbox o production');
if (Boolean(process.env.FLOW_API_KEY) !== Boolean(process.env.FLOW_SECRET_KEY))
  errors.push('Configura juntas FLOW_API_KEY y FLOW_SECRET_KEY');
if (process.env.ALLOW_LOCAL_PRODUCTION === 'true')
  errors.push('ALLOW_LOCAL_PRODUCTION solo se permite para pruebas locales');
if (errors.length) {
  console.error(
    'Configuración de despliegue incompleta:\n' + errors.map((e) => ' - ' + e).join('\n'),
  );
  process.exit(1);
}
console.log(
  `Configuración de despliegue presente. Flow: ${process.env.FLOW_API_KEY ? process.env.FLOW_ENV || 'sandbox' : 'deshabilitado'}. Verifica conectividad, migraciones, correo y cron antes de habilitar ventas.`,
);
