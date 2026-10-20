import { defineConfig } from 'vitest/config';

// relative base so the build works on GitHub Pages under /EmeryInteractive/
export default defineConfig({
  base: './',
  // three.js + KaTeX are most of the bundle; that's expected for this app
  build: { chunkSizeWarningLimit: 1000 },
  // unit tests only; browser tests in tests/e2e run with Playwright
  test: { include: ['tests/**/*.test.ts'] },
});
