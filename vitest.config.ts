import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sergod/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@sergod/foundation': fileURLToPath(
        new URL('./packages/foundation/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    projects: [
      {
        test: {
          environment: 'node',
          include: ['apps/api/tests/contract/**/*.contract.test.ts'],
          name: 'contract',
        },
      },
      {
        test: {
          environment: 'node',
          include: ['apps/api/src/**/*.test.ts', 'packages/**/*.unit.test.ts'],
          name: 'unit',
        },
      },
      {
        test: {
          environment: 'node',
          include: ['apps/api/tests/application/**/*.application.test.ts'],
          name: 'application',
        },
      },
      {
        test: {
          environment: 'node',
          fileParallelism: false,
          include: ['apps/api/tests/integration/**/*.integration.test.ts'],
          name: 'integration',
          sequence: { concurrent: false },
          testTimeout: 30_000,
        },
      },
      {
        test: {
          environment: 'jsdom',
          include: ['apps/web/**/*.test.tsx'],
          name: 'web',
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
  },
});
