import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:3100',
    ...devices['Desktop Chrome'],
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1000 },
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // The setup process closes its PGlite connection before Next opens the same test database.
    command:
      'node --import tsx scripts/e2e-setup.ts && npm run build && node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100',
    url: 'http://localhost:3100/api/health',
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      ALLOW_LOCAL_PRODUCTION: 'true',
      APP_URL: 'http://localhost:3100',
      NEXT_DIST_DIR: '.next-e2e',
      LOCAL_DATA_DIR: '.data/e2e',
      DATABASE_URL: '',
      DATABASE_SCHEMA: 'public',
      SMTP_HOST: '',
      FLOW_API_KEY: '',
      FLOW_SECRET_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      VERCEL: '',
    },
  },
});
