import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import { createServer } from './create-server.js';

describe('technical health endpoint', () => {
  it('reports availability without exposing internal or commercial information', async () => {
    const server = createServer();

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      const payload: unknown = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(payload).toEqual({ status: 'ok' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
