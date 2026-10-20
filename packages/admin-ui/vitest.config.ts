import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Calendar tests compare local dates; run them in a fixed zone.
process.env.TZ = 'UTC';

export default defineConfig({
  plugins: [react()],
  test: {
    name: '@davnode/admin-ui',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // jsdom is slow with Ant Design: a cold first render takes seconds, and
    // axe needs about ten on a large page. Generous, since it is only a ceiling.
    testTimeout: 45_000,
  },
});
