import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/web/src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.mjs',
    ],
    restoreMocks: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/web/src/**'],
      exclude: ['**/*.test.*', '**/index.ts', '**/main.tsx', '**/e2e/**', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      // Plan §4: >= 85% for core, >= 80% overall.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
        'packages/core/src/**': { lines: 85, functions: 85, branches: 80, statements: 85 },
      },
    },
  },
});
