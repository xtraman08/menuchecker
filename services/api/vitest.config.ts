import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // DB integration tests (owned by `database`) opt in via their own env check.
    environment: 'node',
    // First buildApp() in a worker loads fastify/sharp cold, which can take seconds on Windows.
    testTimeout: 30_000,
  },
});
