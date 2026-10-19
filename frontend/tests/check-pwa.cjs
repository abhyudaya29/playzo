// Run against a production server: node tests/check-pwa.cjs
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3100';
    const response = await page.goto(base);
    assert(response.ok());
    await page.waitForFunction(() =>
      document.querySelector('link[rel="manifest"]'),
    );
    const manifest = await (
      await context.request.get(`${base}/manifest.webmanifest`)
    ).json();
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/dashboard');
    for (const icon of manifest.icons) {
      const response = await context.request.get(`${base}${icon.src}`);
      assert(response.ok(), `Missing icon: ${icon.src}`);
      assert(response.headers()['content-type'].includes('image/png'));
    }
    const sw = await context.request.get(`${base}/sw.js`);
    assert(sw.headers()['cache-control'].includes('no-store'));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.goto(`${base}/dashboard`);
    await page
      .getByRole('heading', { name: 'Back in the game soon.' })
      .waitFor();
    const caches = await page.evaluate(async () => {
      const entries = [];
      for (const key of await window.caches.keys()) {
        for (const request of await (await window.caches.open(key)).keys())
          entries.push(new URL(request.url).pathname);
      }
      return entries;
    });
    assert.deepEqual(caches, ['/offline.html']);
    console.log(
      'PASS: manifest, PNG icons, service worker, offline navigation, private-data cache isolation',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
