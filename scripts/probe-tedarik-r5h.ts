import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  // 1) tedarikciler mobil tap -> ne oluyor
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    await openRoute(page, { base, route: '/satin-alma/tedarikciler', as: 'satin_alma' });
    const li = page.locator('main ul > li').first(); const b = await li.boundingBox();
    await page.mouse.click(b!.x + 40, b!.y + b!.height / 2);
    await page.waitForTimeout(3000);
    console.log('TED mobil tap ->', page.url(), '| dialog?', await page.locator('[role="dialog"]').count(), '| errs', errs.slice(0, 3));
    await ctx.close();
  }
  // 2) tedarikciler masaüstü satır tıklaması
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route: '/satin-alma/tedarikciler', as: 'satin_alma' });
    await page.locator('tbody tr').first().click({ position: { x: 60, y: 18 } });
    await page.waitForTimeout(3000);
    console.log('TED masaüstü satır tıklaması ->', page.url());
    await ctx.close();
  }
  // 3) kritik-stok mobil tap -> drawer açılıyor mu
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route: '/satin-alma/kritik-stok', as: 'satin_alma' });
    const li = page.locator('main ul > li').first(); const b = await li.boundingBox();
    await page.mouse.click(b!.x + 40, b!.y + b!.height / 2);
    await page.waitForTimeout(2000);
    console.log('KRITIK mobil tap -> dialog', await page.locator('[role="dialog"]').count(), '| url', page.url());
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
