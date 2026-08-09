import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Node, not jsdom, by default: most of this codebase is server-side (API
    // routes, Prisma, jose). jsdom's Uint8Array lives in a separate realm from
    // Node's, which breaks jose's internal `instanceof Uint8Array` checks —
    // override to jsdom per-file (`// @vitest-environment jsdom`) for actual
    // browser-facing component tests once those exist (Slice 7).
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    exclude: ['node_modules', '.next', 'e2e'],
  },
});
