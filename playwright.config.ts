import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off', viewport: { width: 390, height: 844 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  // The script starts a throwaway Postgres, seeds it, creates logins, builds, then starts the app (see the file).
  webServer: {
    command: 'node tests/helpers/e2e-server.mjs',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 360_000,
  },
});
