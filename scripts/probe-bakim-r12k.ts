import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [name, route] of [['isemirleri', '/bakim/is-emirleri'], ['makineler', '/bakim/makineler'], ['planlar', '/bakim/planlar']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    await page.locator('main input').first().fill('zzzqqqq');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `artifacts/critic/bakim-r12-bos-${name}.png`, fullPage: false });
    out[name] = await page.evaluate(() => {
      const m = document.querySelector('main') as HTMLElement;
      return { text: m.innerText.slice(0, 260).replace(/\n/g, ' | ') };
    });
    await ctx.close();
  }
  // kanban görünümü: liste/pano düğmesi
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
    const btns = page.locator('main button').filter({ hasText: '' });
    const n = await btns.count();
    // görünüm seçici: sağ üstteki iki ikon düğmesi
    await page.locator('main button:near(:text("kayıt"))').first().click().catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'artifacts/critic/bakim-r12-kanban.png', fullPage: false });
    out.kanban = await page.evaluate(() => (document.querySelector('main') as HTMLElement).innerText.slice(0, 220).replace(/\n/g, ' | '));
    out.btnCount = n;
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
