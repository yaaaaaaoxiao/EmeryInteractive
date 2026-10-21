import { defineConfig } from 'vitest/config';
import { formulasPlugin } from './vite-plugins/formulas.ts';

// relative base so the build works on GitHub Pages under /EmeryInteractive/
export default defineConfig({
  base: './',
  // the info panel's formulas are rendered to HTML at build time (no KaTeX library in the page)
  plugins: [formulasPlugin()],
  // three.js is most of the bundle; that's expected for this app
  build: { chunkSizeWarningLimit: 1000 },
  // unit tests only; browser tests in tests/e2e run with Playwright
  test: { include: ['tests/**/*.test.ts'] },
});
