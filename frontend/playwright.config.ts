import { defineConfig } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: 'list',
  use: {
    actionTimeout: 15000,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: 'npm run dev -- --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
