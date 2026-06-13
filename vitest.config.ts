import { defineConfig } from 'vitest/config';

// Vitest гоняет только юнит-тесты движка в tests/.
// E2E (e2e/*.spec.ts) — отдельно через Playwright (npm run test:e2e).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
