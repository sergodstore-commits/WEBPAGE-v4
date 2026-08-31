import { describe, expect, it } from 'vitest';

import { loadDatabaseRuntimeConfig } from './database-runtime-config.js';

describe('database runtime configuration', () => {
  it('allows the anonymous catalog to remain disabled without a database', () => {
    expect(loadDatabaseRuntimeConfig({})).toBeNull();
  });

  it('loads only a valid private database URL', () => {
    expect(
      loadDatabaseRuntimeConfig({ DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test' }),
    ).toEqual({ databaseUrl: 'postgresql://test:test@127.0.0.1:5432/test' });
    expect(() => loadDatabaseRuntimeConfig({ DATABASE_URL: 'not-a-url' })).toThrow();
  });

  it('loads an optional base64-encoded database certificate authority', () => {
    const certificate = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n';
    expect(
      loadDatabaseRuntimeConfig({
        DATABASE_SSL_CA_BASE64: Buffer.from(certificate).toString('base64'),
        DATABASE_URL:
          'postgresql://test:test@database.example.com:5432/test?application_name=test&sslmode=require',
      }),
    ).toEqual({
      databaseUrl: 'postgresql://test:test@database.example.com:5432/test?application_name=test',
      sslCaCertificate: certificate,
    });
    expect(() =>
      loadDatabaseRuntimeConfig({
        DATABASE_SSL_CA_BASE64: Buffer.from('not-a-certificate').toString('base64'),
        DATABASE_URL: 'postgresql://test:test@database.example.com:5432/test',
      }),
    ).toThrow(/base64-encoded PEM certificate/u);
  });
});
