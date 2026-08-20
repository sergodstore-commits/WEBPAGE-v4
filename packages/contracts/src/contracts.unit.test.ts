import { describe, expect, it } from 'vitest';

import {
  createCategorySchema,
  editCategorySchema,
  editProductSchema,
  ContractValidationError,
  canonicalJson,
  isRegisteredCode,
  metadataRegistry,
  outboxPayloadRegistry,
  publicServiceInfoSchema,
  snapshotRegistry,
} from './index.js';

describe('closed compiled contract registries', () => {
  it('canonicalizes object keys deterministically', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
  });

  it('accepts a strict audit context and rejects unknown keys', () => {
    const value = {
      error_code: 'SCHEMA_VALIDATION_FAILED',
      failure_stage: 'validation',
      field_names: ['payload'],
      metadata_contract: 'AuditDiagnosticContext.v1',
      metadata_schema_version: 1,
    };

    expect(metadataRegistry.validate('AuditDiagnosticContext.v1', value)).toEqual(value);
    expect(() =>
      metadataRegistry.validate('AuditDiagnosticContext.v1', { ...value, secret: 'forbidden' }),
    ).toThrow(ContractValidationError);
  });

  it('activates DeliverySnapshot only with a complete owned representation', () => {
    expect(snapshotRegistry.list().some(({ contract }) => contract === 'DeliverySnapshot.v1')).toBe(
      true,
    );
    expect(() => snapshotRegistry.validate('DeliverySnapshot.v1', {})).toThrowError(
      expect.objectContaining({ code: 'SCHEMA_VALIDATION_FAILED' }),
    );
    expect(snapshotRegistry.list().some(({ contract }) => contract === 'DeliverySnapshot.v2')).toBe(
      true,
    );
    const shippingV2 = {
      snapshot_contract: 'DeliverySnapshot.v2',
      snapshot_schema_version: 2,
      mode: 'SHIPPING',
      recipientName: 'Cliente',
      contactEmail: 'cliente@example.test',
      contactPhone: null,
      capturedAt: '2026-08-13T12:00:00.000Z',
      shippingPaymentMode: 'FREIGHT_COLLECT',
      destinationType: 'CARRIER_AGENCY',
      carrier: 'STARKEN',
      destinationCommune: 'Copiapó',
      agencyDestination: 'Agencia Starken Copiapó Centro',
      shippingCostAmountClp: 0,
      shippingIncludedInOrderTotal: false,
      orderTotalWithoutShippingClp: 10_000,
    };
    expect(snapshotRegistry.validate('DeliverySnapshot.v2', shippingV2)).toEqual(shippingV2);
    expect(() =>
      snapshotRegistry.validate('DeliverySnapshot.v2', {
        ...shippingV2,
        shippingCostAmountClp: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'SCHEMA_VALIDATION_FAILED' }));
  });

  it('accepts only credential-free HTTPS map URLs for public service information', () => {
    const base = {
      branchId: crypto.randomUUID(),
      publicAddress: 'Address',
      openingHours: 'Monday',
      publicContacts: 'contact@example.test',
      directions: null,
      reason: null,
    };
    expect(
      publicServiceInfoSchema.parse({ ...base, mapUrl: 'https://maps.example.test/store' }),
    ).toMatchObject({ mapUrl: 'https://maps.example.test/store' });
    expect(() =>
      publicServiceInfoSchema.parse({ ...base, mapUrl: 'http://example.test' }),
    ).toThrow();
    expect(() =>
      publicServiceInfoSchema.parse({ ...base, mapUrl: 'https://user:pass@example.test' }),
    ).toThrow();
  });

  it('rejects event payloads until a documented owning phase registers a real type', () => {
    expect(() =>
      outboxPayloadRegistry.validate('CommercialEventWasNotInvented', 1, 'Unknown.v1', {}),
    ).toThrowError(expect.objectContaining({ code: 'UNKNOWN_CONTRACT' }));
  });

  it('recognizes only documented stable codes', () => {
    expect(isRegisteredCode('LEASE_LOST')).toBe(true);
    expect(isRegisteredCode('MADE_UP_CODE')).toBe(false);
  });

  it('keeps administrative catalog bodies closed and PATCH bodies non-empty', () => {
    expect(() =>
      createCategorySchema.parse({
        description: null,
        gameId: crypto.randomUUID(),
        name: 'Sellados',
      }),
    ).toThrow();
    expect(() => editCategorySchema.parse({})).toThrow();
    expect(() => editProductSchema.parse({ stock: 1 })).toThrow();
    expect(editProductSchema.parse({ description: null })).toEqual({ description: null });
  });
});
