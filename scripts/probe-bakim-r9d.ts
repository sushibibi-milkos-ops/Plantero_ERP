/** Tur 9: filtrelenmiş boş durum — masaüstü liste, masaüstü kanban, mobil. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const base = defaultBaseUrl();
  const out: any = {};
  for (const [key, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as any[]) {
    const browser = await launchBrowser();
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
    await page.getByPlaceholder(/İş emri no/).fill('zzzzqq');
    await page.waitForTimeout(500);
    out[key] = await page.evaluate(() => {
      const vis = Array.from(document.querySelectorAll('main *')).filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && e.children.length === 0 && (e.textContent || '').trim().length > 0;
      });
      return vis.map((e) => (e.textContent || '').trim()).filter((t) => /yok|Eşleş|dene|bildir|üret|kayıt/i.test(t));
    });
    if (key === 'desktop') {
      await page.getByLabel('Kanban görünümü').click();
      await page.waitForTimeout(500);
      out.desktopKanban = await page.evaluate(() => {
        const vis = Array.from(document.querySelectorAll('main *')).filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && e.children.length === 0 && (e.textContent || '').trim().length > 0;
        });
        return vis.map((e) => (e.textContent || '').trim()).filter((t) => /yok|Eşleş|dene|bildir|üret|kayıt/i.test(t));
      });
      await page.screenshot({ path: 'artifacts/critic/bakim-r9-bos-kanban-1440.png' });
    }
    await browser.close();
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
})();
