import { expect, test } from '@playwright/test';

// The original version is kept under /legacy/. It used to send usage events and visitors' IP addresses to
// Google Analytics; it should now work without contacting them. (It still loads MathJax from cdnjs.)
const TRACKERS = /google-analytics\.com|googletagmanager\.com|ipify\.org/;

// already broken in the original HCP page, which CrystalView doesn't cover
const KNOWN_ERROR = /drawCoordination/;

for (const page of ['index', 'index-fcc', 'index-bcc', 'index-sc', 'index-hcp']) {
  test(`legacy ${page} works without trackers`, async ({ page: p }) => {
    const errors: string[] = [];
    const tracked: string[] = [];
    p.on('pageerror', (e) => KNOWN_ERROR.test(e.message) || errors.push(e.message));
    p.on('request', (r) => TRACKERS.test(r.url()) && tracked.push(r.url()));
    await p.goto(`/legacy/${page}.html`);
    await p.waitForLoadState('load');
    // clicks are what used to send analytics events
    await p.mouse.click(700, 450);
    for (const button of await p.locator('button, .button, input[type=button]').all()) {
      if (await button.isVisible()) await button.click({ timeout: 1000 }).catch(() => {});
    }
    await p.waitForTimeout(300);
    expect(errors).toEqual([]);
    expect(tracked).toEqual([]);
  });
}
