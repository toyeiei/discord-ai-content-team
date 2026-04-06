import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': resolve(__dirname, 'src/__mocks__/cloudflare-workers.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '*.config.*',
        '**/*.d.ts',
        'src/env.ts', // Only type declarations
        'src/index.ts', // Worker runtime
        'src/workflow.ts', // Cloudflare Workflows runtime
        'src/github.ts', // Calls GitHub API
        'src/minimax.ts', // Calls MiniMax API
        'src/exa.ts', // Calls Exa API
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    include: ['src/**/*.test.ts'],
  },
});
