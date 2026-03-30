import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:3400',
    trace:   'on-first-retry',
    video:   'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Start the demo dev server before tests run
  webServer: {
    command:            'npm run dev --prefix ../demo',
    url:                'http://localhost:3400',
    reuseExistingServer: !process.env.CI,
    timeout:            60_000,
    stdout:             'pipe',
    stderr:             'pipe',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  timeout: 30_000,
  expect:  { timeout: 8_000 },
});
