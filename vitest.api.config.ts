import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/api/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/helpers/db-global-setup.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
