import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function run() {
  const browser = await launchBrowser();
  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    await page.locator('input[aria-label="Tabloda ara"]').fill('zzzqqq');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/critic/arge-r15-bos-${key}.png` });
    await ctx.close();
  }
  await browser.close();
}
run().catch((e) => { console.error(e); process.exit(1); });
