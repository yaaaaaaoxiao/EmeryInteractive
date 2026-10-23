import { defineConfig, devices } from '@playwright/test';

// Browser tests: open the real site in Chromium and WebKit (Safari's engine) and use it like a person would.
// They run against the dev server, which exposes `store` and `viewer` on window (see src/main.ts).
const port = 5174;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // GitHub's machines draw WebGL in software and run these several times slower than a laptop, so allow more time
  // there (a test that really hangs still fails within the default 30 s here)
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 900 } } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
