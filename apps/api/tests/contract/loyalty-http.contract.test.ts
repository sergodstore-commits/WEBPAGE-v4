import {
  createLoyaltyConfigurationSchema,
  loyaltyAdminCorrectionSchema,
  loyaltyConfigurationSnapshotSchema,
  snapshotRegistry,
} from '@sergod/contracts';
import { describe, expect, it } from 'vitest';

const id = '0198a8be-6677-7000-8000-000000000001';

describe('Loyalty contracts', () => {
  it('keeps configuration and correction bodies closed and integer-only', () => {
    const configuration = {
      branchId: id,
      earnClpPerPoint: 1000,
      maximumRedeemBasisPoints: 5000,
      minimumRedeemPoints: 10,
      redeemClpPerPoint: 100,
    };
    expect(createLoyaltyConfigurationSchema.parse(configuration)).toEqual(configuration);
    expect(() =>
      createLoyaltyConfigurationSchema.parse({ ...configuration, earnClpPerPoint: 1.5 }),
    ).toThrow();
    expect(() =>
      createLoyaltyConfigurationSchema.parse({ ...configuration, maximumRedeemBasisPoints: 10001 }),
    ).toThrow();
    expect(() =>
      createLoyaltyConfigurationSchema.parse({ ...configuration, orderId: id }),
    ).toThrow();
    expect(
      loyaltyAdminCorrectionSchema.parse({ pointsSigned: -4, reason: 'Correction evidence' }),
    ).toBeDefined();
    expect(() =>
      loyaltyAdminCorrectionSchema.parse({ pointsSigned: 0, reason: 'No-op' }),
    ).toThrow();
  });

  it('activates the versioned snapshot without commercial source identifiers', () => {
    const snapshot = {
      earnClpPerPoint: 1000,
      loyaltyConfigurationId: id,
      maximumRedeemBasisPoints: null,
      minimumRedeemPoints: 0,
      redeemClpPerPoint: 100,
      snapshot_contract: 'LoyaltyConfigurationSnapshot.v1',
      snapshot_schema_version: 1,
      versionNumber: 1,
    };
    expect(loyaltyConfigurationSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshotRegistry.validate('LoyaltyConfigurationSnapshot.v1', snapshot)).toEqual(
      snapshot,
    );
  });
});
