import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  for (const route of ['/satin-alma/kritik-stok', '/satin-alma/siparisler']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route, as: 'satin_alma' });
    const r = await page.evaluate(() => {
      const strip = document.querySelector('main [class*="snap-x"]') as HTMLElement | null;
      if (!strip) return null;
      const sr = strip.getBoundingClientRect();
      const cards = Array.from(strip.children).map((c) => { const b = c.getBoundingClientRect(); return { t: (c.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 26), left: Math.round(b.left), right: Math.round(b.right), clipped: Math.round(b.right - sr.right) }; });
      return { stripRight: Math.round(sr.right), sw: strip.scrollWidth, cw: strip.clientWidth, cards };
    });
    console.log(route, JSON.stringify(r));
    // KPI değer ondalık kontrolü (masaüstü)
    await ctx.close();
  }
  { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage(); await openRoute(page, { base, route: '/satin-alma/siparisler', as: 'satin_alma' });
    console.log('KPI vs tablo:', JSON.stringify(await page.evaluate(() => {
      const kpi = Array.from(document.querySelectorAll('main [class*="text-[19px]"]')).map((e) => (e.textContent ?? '').trim());
      const cell = Array.from(document.querySelectorAll('tbody tr td:last-child, tbody tr td')).map((e) => (e.textContent ?? '').trim()).filter((t) => t.startsWith('₺')).slice(0, 2);
      return { kpi, cell };
    })));
    await ctx.close(); }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
