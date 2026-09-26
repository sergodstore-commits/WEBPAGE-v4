export function assertVerificationSchema(schema: string): void {
  if (!/^sergod_verify_[0-9a-f]{32}$/.test(schema))
    throw new Error('La verificación solo puede usar su esquema aleatorio sergod_verify_.');
}

export function verificationDropSql(
  schema: string,
  createdSchema: string | undefined,
  expectedMarker: string,
  actualMarker: unknown,
): string {
  assertVerificationSchema(schema);
  if (schema !== createdSchema || !expectedMarker || actualMarker !== expectedMarker)
    throw new Error(
      'Se rechazó la limpieza: no se pudo confirmar el esquema creado por este proceso.',
    );
  return `DROP SCHEMA "${schema}" CASCADE`;
}
