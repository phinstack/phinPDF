import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env['CI']);
// Lets a machine use a pre-installed Chromium instead of downloading Playwright's.
const chromiumPath = process.env['PW_CHROMIUM_PATH'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // WebKit is required, not best-effort: the Linux desktop app runs on WebKitGTK.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
