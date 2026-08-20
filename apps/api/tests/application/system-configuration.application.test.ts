import type { ExecutionContext } from '@sergod/foundation';
import { describe, expect, it, vi } from 'vitest';

import type {
  SystemConfigurationAdminAuthorizer,
  SystemConfigurationRepository,
  SystemConfigurationView,
} from '../../src/contexts/system-configuration/application/ports.js';
import { SystemConfigurationService } from '../../src/contexts/system-configuration/application/system-configuration-service.js';

const actorId = '0198a8be-6677-7000-8000-000000000101';
const context: ExecutionContext = {
  actorId,
  actorType: 'USER',
  correlationId: '0198a8be-6677-7000-8000-000000000102',
  idempotencyKey: 'configure-cart-inactivity-v1',
};

function draft(value: number): SystemConfigurationView {
  return {
    activatedAt: null,
    activatedBy: null,
    branchId: null,
    configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
    correlationId: context.correlationId,
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    createdBy: actorId,
    retiredAt: null,
    retiredBy: null,
    scope: 'GLOBAL',
    state: 'DRAFT',
    systemConfigurationId: '0198a8be-6677-7000-8000-000000000103',
    value,
    valueType: 'INTEGER',
    versionNumber: 1,
  };
}

function doubles() {
  let current = draft(5760);
  const authorizer: SystemConfigurationAdminAuthorizer = {
    assertCanManageSystemConfigurations: vi.fn(async () => undefined),
  };
  const repository: SystemConfigurationRepository = {
    activate: vi.fn(async ({ systemConfigurationId }) => ({
      replayed: false,
      systemConfigurationId,
    })),
    createVersion: vi.fn(async ({ value }) => {
      current = draft(value as number);
      return { replayed: false, systemConfigurationId: current.systemConfigurationId };
    }),
    findActive: vi.fn(async () => null),
    findById: vi.fn(async () => current),
    list: vi.fn(async () => ({ hasMore: false, items: [current] })),
    retire: vi.fn(async ({ systemConfigurationId }) => ({
      replayed: false,
      systemConfigurationId,
    })),
    updateDraft: vi.fn(async ({ systemConfigurationId, value }) => {
      current = draft(value as number);
      return { replayed: false, systemConfigurationId };
    }),
  };
  return {
    authorizer,
    repository,
    service: new SystemConfigurationService(repository, authorizer),
  };
}

describe('SystemConfiguration application service', () => {
  it('creates the approved cart inactivity value through the closed registry', async () => {
    const subject = doubles();

    const result = await subject.service.createVersion(context, {
      configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
      reason: 'Configure the approved anonymous cart inactivity period.',
      value: 5760,
    });

    expect(result.item.value).toBe(5760);
    expect(subject.repository.createVersion).toHaveBeenCalledOnce();
    expect(subject.repository.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
        idempotencyKey: context.idempotencyKey,
        value: 5760,
      }),
    );
  });

  it('rejects a value outside the key-specific range before persistence', async () => {
    const subject = doubles();

    await expect(
      subject.service.createVersion(context, {
        configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
        reason: 'Invalid value must not be persisted.',
        value: 0,
      }),
    ).rejects.toMatchObject({ code: 'SYSTEM_CONFIGURATION_VALUE_INVALID' });
    expect(subject.repository.createVersion).not.toHaveBeenCalled();
  });

  it('requires an authenticated user before consulting configuration', async () => {
    const subject = doubles();

    await expect(
      subject.service.listDefinitions({
        actorType: 'SYSTEM',
        correlationId: context.correlationId,
      }),
    ).rejects.toMatchObject({ code: 'SYSTEM_CONFIGURATION_ACCESS_DENIED' });
    expect(subject.authorizer.assertCanManageSystemConfigurations).not.toHaveBeenCalled();
  });
});
