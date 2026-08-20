import { describe, expect, it } from 'vitest';

import { CancelableWorker } from '../../src/platform/workers/cancelable-worker.js';

describe('cancelable technical worker', () => {
  it('stops after its abort signal without scheduling additional work', async () => {
    const controller = new AbortController();
    let ticks = 0;
    const worker = new CancelableWorker(async () => {
      ticks += 1;
      controller.abort();
    }, 1);

    await worker.run(controller.signal);

    expect(ticks).toBe(1);
  });
});
