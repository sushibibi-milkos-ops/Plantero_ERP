/** Tur 9: arıza bildir formu @390 — sticky aksiyon çubuğu foto ekleme döşemesini örtüyor mu. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/is-emirleri/yeni', as: 'admin' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button,label,div')) as HTMLElement[];
    const dz = all.filter((e) => /dashed/.test(e.className.toString()) && /Ekle/.test(e.textContent || ''));
    const out: any[] = [];
    for (const e of dz) {
      const r = e.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const probes: any[] = [];
      for (const f of [0.15, 0.5, 0.9]) {
        const y = Math.round(r.top + r.height * f);
        const top = document.elementFromPoint(cx, y) as HTMLElement | null;
        probes.push({ f, y, covered: !!top && !e.contains(top) && top !== e, topTag: top?.tagName, topCls: (top?.className || '').toString().slice(0, 60) });
      }
      out.push({ cls: e.className.toString().slice(0, 80), rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }, probes });
    }
    return { vh: window.innerHeight, scrollY: Math.round(window.scrollY), maxScroll: document.documentElement.scrollHeight - window.innerHeight, zones: out };
  });
  await page.screenshot({ path: 'artifacts/critic/bakim-r9-yeni-390-bottom.png' });
  await browser.close();
  process.stdout.write(JSON.stringify(res, null, 2) + '\n');
})();
