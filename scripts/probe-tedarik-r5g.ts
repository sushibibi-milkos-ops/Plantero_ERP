import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  for (const route of ['/satin-alma/siparisler', '/satin-alma/tedarikciler', '/satin-alma/kritik-stok']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route, as: 'satin_alma' });
    const before = page.url();
    const li = page.locator('main ul > li').first();
    const box = await li.boundingBox();
    await page.mouse.click((box!.x + 40), (box!.y + box!.height / 2));
    await page.waitForTimeout(2500);
    console.log(route, '| tap ->', page.url(), '| navigated', page.url() !== before, '| cursor', await li.evaluate((e) => getComputedStyle(e).cursor));
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
