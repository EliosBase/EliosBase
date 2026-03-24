import { defineConfig, devices } from '@playwright/test';

const port = 34117;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  outputDir: 'output/playwright/test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ANTHROPIC_API_KEY: 'playwright-anthropic-key',
      BASE_RPC_URL: 'http://127.0.0.1:8545',
      CRON_SECRET: 'playwright-cron-secret',
      NEXT_PUBLIC_CHAIN: 'testnet',
      NEXT_PUBLIC_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000001',
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'playwright-supabase-anon-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://playwright.supabase.co',
      NEXT_PUBLIC_VERIFIER_ADDRESS: '0x0000000000000000000000000000000000000002',
      PROOF_SUBMITTER_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
      SESSION_SECRET: 'playwright-session-secret-playwright-session-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'playwright-supabase-service-role-key',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
