import { defineConfig } from '@playwright/test';

const port = 34118;
const baseURL = `http://127.0.0.1:${port}`;
const reownProjectId =
  process.env.PLAYWRIGHT_REOWN_PROJECT_ID
  ?? process.env.NEXT_PUBLIC_REOWN_PROJECT_ID
  ?? '072ab9c34a6c039e2b448cc42a0494ae';

export default defineConfig({
  testDir: './e2e-wallet',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'output/playwright/wallet-results',
  use: {
    baseURL,
    headless: process.env.HEADLESS === 'true',
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
      NEXT_PUBLIC_CHAIN: 'mainnet',
      NEXT_PUBLIC_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000001',
      NEXT_PUBLIC_PROJECT_ID: reownProjectId,
      NEXT_PUBLIC_REOWN_PROJECT_ID: reownProjectId,
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'playwright-supabase-anon-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://playwright.supabase.co',
      NEXT_PUBLIC_VERIFIER_ADDRESS: '0x0000000000000000000000000000000000000002',
      NEXT_PUBLIC_WALLET_E2E_SKIP_CHAIN_SWITCH: '1',
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_WALLET_REQUIRE_CHROME_PROFILE: '1',
      PROOF_SUBMITTER_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
      SESSION_SECRET: 'playwright-session-secret-playwright-session-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'playwright-supabase-service-role-key',
    },
  },
});
