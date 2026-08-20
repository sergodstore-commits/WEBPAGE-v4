import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('notification executable wiring', () => {
  it('wires polling into API main with an explicit enable flag and shutdown signal', async () => {
    const main = await readFile('apps/api/src/main.ts', 'utf8');
    expect(main).toContain('notificationWorkerEnabled(process.env)');
    expect(main).toContain('new CancelableWorker');
    expect(main).toContain('notificationRuntime.worker.run(notificationRuntime.batchSize)');
    expect(main).toContain('notificationController.abort()');
  });

  it('provides an independently executable one-shot job', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const job = await readFile('scripts/run-notification-worker.ts', 'utf8');
    expect(packageJson.scripts['notifications:run']).toBe('tsx scripts/run-notification-worker.ts');
    expect(job).toContain('runtime.worker.run(runtime.batchSize)');
    expect(job).toContain('await pool.end()');
  });
});
