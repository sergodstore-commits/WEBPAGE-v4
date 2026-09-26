import type { PoolConfig } from 'pg';

type Environment = Record<string, string | undefined>;

export function databaseSchema(env: Environment = process.env): string {
  const schema = env.DATABASE_SCHEMA || 'public';
  if (
    !/^[a-z_][a-z0-9_]{0,62}$/.test(schema) ||
    schema.startsWith('pg_') ||
    schema === 'information_schema'
  )
    throw new Error(
      'DATABASE_SCHEMA debe ser un identificador SQL en minúsculas de hasta 63 caracteres y no un esquema reservado.',
    );
  return schema;
}

export function databasePoolConfig(env: Environment = process.env): PoolConfig {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL || '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('DATABASE_URL debe ser una cadena de conexión PostgreSQL válida.');
  }
  // pg lets URL SSL parameters replace the entire ssl object, including the CA.
  // TLS policy belongs to the explicit server environment, never to URL defaults.
  for (const key of [...url.searchParams.keys()])
    if (key.toLowerCase().startsWith('ssl') || key === 'uselibpqcompat')
      url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 20000,
    ssl:
      env.DATABASE_SSL === 'false'
        ? false
        : {
            rejectUnauthorized: true,
            ca: env.DATABASE_SSL_CA?.replace(/\\n/g, '\n'),
          },
  };
}
