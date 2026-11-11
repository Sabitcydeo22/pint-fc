import { defineConfig } from 'vitest/config';

// Database tests share ONE real Postgres 17 (embedded-postgres), started in globalSetup with a
// migrated template database; each test file gets its own copy. Files run one at a time.
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/helpers/db-global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
