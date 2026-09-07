/** Tur 9: /bakim/makineler ve /bakim/planlar filtrelenmiş boş durum metni. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const base = defaultBaseUrl();
  const out: any = {};
  for (const [key, route, ph] of [['makineler', '/bakim/makineler', /Makine kodu/], ['planlar', '/bakim/planlar', /Plan adı/]] as any[]) {
    const browser = await launchBrowser();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    await page.getByPlaceholder(ph).fill('zzzzqq');
    await page.waitForTimeout(500);
    out[key] = await page.evaluate(() => {
      const vis = Array.from(document.querySelectorAll('main *')).filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && e.children.length === 0 && (e.textContent || '').trim().length > 0;
      });
      return vis.map((e) => (e.textContent || '').trim()).filter((t) => /yok|Eşleş|dene|üret|seed|kayıt/i.test(t));
    });
    await browser.close();
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
})();
