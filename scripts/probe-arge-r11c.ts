/** Tur 11 — boş durum (arama sonucu yok) ve iskelet kontrolü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const route of ['/arge/projeler', '/arge/receteler']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    await page.fill('input[aria-label="Tabloda ara"]', 'zzzqqq');
    await page.waitForTimeout(700);
    out[route] = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const txt = (main.textContent ?? '').replace(/\s+/g, ' ');
      const svgs = main.querySelectorAll('svg').length;
      const btns = [...main.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter(Boolean);
      return { empty: /bulunamadı|sonuç yok|kayıt yok|Sonuç/i.test(txt), snippet: txt.slice(0, 400), svgs, btns: btns.slice(-6) };
    });
    await page.screenshot({ path: 'artifacts/critic/arge-r11-bos-' + route.split('/').pop() + '.png' });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
