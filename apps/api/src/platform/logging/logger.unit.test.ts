import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

describe('structured logger', () => {
  it('redacts secrets from structured records', async () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger('info', destination);

    logger.info(
      {
        correlationId: '0198a8be-6677-7000-8000-000000000001',
        operation: 'FOUNDATION_TEST',
        password: 'must-not-appear',
        result: 'SUCCESS',
      },
      'technical event',
    );
    await new Promise<void>((resolve) => destination.end(resolve));

    expect(output).not.toContain('must-not-appear');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('"operation":"FOUNDATION_TEST"');
  });
});
