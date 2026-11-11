import { defineConfig } from 'vitest/config';

// Database tests start a real Postgres 17 (embedded-postgres), so they get long timeouts
// and run one file at a time.
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
