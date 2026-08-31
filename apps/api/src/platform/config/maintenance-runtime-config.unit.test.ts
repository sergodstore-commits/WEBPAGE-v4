import { describe, expect, it } from 'vitest';

import { loadMaintenanceRuntimeConfig } from './maintenance-runtime-config.js';

describe('maintenance runtime configuration', () => {
  it('stays disabled when the token is absent', () => {
    expect(loadMaintenanceRuntimeConfig({})).toBeNull();
  });

  it('loads a sufficiently strong token', () => {
    expect(loadMaintenanceRuntimeConfig({ MAINTENANCE_JOB_TOKEN: 'x'.repeat(32) })).toEqual({
      token: 'x'.repeat(32),
    });
  });

  it('rejects short tokens', () => {
    expect(() => loadMaintenanceRuntimeConfig({ MAINTENANCE_JOB_TOKEN: 'too-short' })).toThrow();
  });
});
