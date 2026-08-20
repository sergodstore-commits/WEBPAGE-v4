import { describe, expect, it } from 'vitest';

import { loadRuntimeConfig } from './load-runtime-config.js';

describe('loadRuntimeConfig', () => {
  it('uses safe local defaults for the technical server', () => {
    expect(loadRuntimeConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3000,
    });
  });

  it('rejects an invalid API port', () => {
    expect(() => loadRuntimeConfig({ API_PORT: 'not-a-port' })).toThrow(
      'API_PORT must be an integer between 1 and 65535.',
    );
  });
});
