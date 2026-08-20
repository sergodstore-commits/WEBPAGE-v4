import { describe, expect, it } from 'vitest';

import {
  createSystemConfigurationSchema,
  systemConfigurationListQuerySchema,
  systemConfigurationTransitionSchema,
} from './system-configuration.js';

describe('system configuration contracts', () => {
  it('accepts a registered scalar version without allowing client-owned metadata', () => {
    expect(
      createSystemConfigurationSchema.parse({
        configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
        reason: 'Four days of inactivity',
        value: 5760,
      }),
    ).toMatchObject({ value: 5760 });
    expect(() =>
      createSystemConfigurationSchema.parse({
        configurationKey: 'UNKNOWN_KEY',
        reason: 'Unknown',
        value: 1,
      }),
    ).toThrow();
    expect(() =>
      createSystemConfigurationSchema.parse({
        configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
        reason: 'Invalid metadata',
        value: 5760,
        valueType: 'INTEGER',
      }),
    ).toThrow();
  });

  it('does not coerce scalar values and keeps queries and transitions closed', () => {
    for (const value of ['5760', 1.5, true, null]) {
      expect(() =>
        createSystemConfigurationSchema.parse({
          configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
          reason: 'Invalid value',
          value,
        }),
      ).toThrow();
    }
    expect(() => systemConfigurationListQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() =>
      systemConfigurationTransitionSchema.parse({ nextState: 'INACTIVE', reason: 'Invalid' }),
    ).toThrow();
  });
});
