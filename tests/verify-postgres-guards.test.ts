import test from 'node:test';
import assert from 'node:assert/strict';
import { assertVerificationSchema, verificationDropSql } from '../scripts/verify-postgres-guards';

test('la limpieza de verificación rechaza nombres productivos, patrones e inyección', () => {
  for (const schema of [
    'public',
    'sergod_store',
    'sergod_verify_',
    'sergod_verify_*',
    'sergod_verify_' + 'a'.repeat(31),
    'sergod_verify_' + 'a'.repeat(32) + '"; DROP SCHEMA public CASCADE;--',
  ])
    assert.throws(() => assertVerificationSchema(schema));
});

test('la limpieza exige el nombre exacto creado y su marcador de propiedad', () => {
  const schema = 'sergod_verify_' + 'a'.repeat(32);
  const other = 'sergod_verify_' + 'b'.repeat(32);
  assert.equal(
    verificationDropSql(schema, schema, 'nonce', 'nonce'),
    `DROP SCHEMA "${schema}" CASCADE`,
  );
  assert.throws(() => verificationDropSql(schema, undefined, 'nonce', 'nonce'));
  assert.throws(() => verificationDropSql(schema, other, 'nonce', 'nonce'));
  assert.throws(() => verificationDropSql(schema, schema, 'nonce', 'changed'));
  assert.throws(() => verificationDropSql(schema, schema, 'nonce', undefined));
  assert.throws(() => verificationDropSql(schema, schema, '', ''));
});
