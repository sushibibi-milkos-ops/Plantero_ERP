/** Tur 11 — mobil ilk kart ofseti + eşzamanlı dolu-vurgu (primary) buton sayısı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const PID = '75d786b3-35db-4191-b19e-8c77aa84bba5';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const route of ['/arge/projeler', '/arge/receteler']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    out['mobil' + route] = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const li = main.querySelector('ul > li') as HTMLElement | null;
      const m = main.getBoundingClientRect();
      return li ? { firstCardTop_viewport: Math.round(li.getBoundingClientRect().top), mainOffset: Math.round(li.getBoundingClientRect().top - m.top), cardH: Math.round(li.getBoundingClientRect().height) } : null;
    });
    await ctx.close();
  }
  for (const spec of [['precete', '/arge/projeler/' + PID + '/receteler'], ['projeler', '/arge/projeler']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: spec[1]!, as: 'admin' });
    out['primary_' + spec[0]] = await page.evaluate(() => {
      const res: unknown[] = [];
      for (const b of [...document.querySelectorAll('main button, main a[data-slot="button"]')]) {
        const cs = getComputedStyle(b);
        const bg = cs.backgroundColor;
        const r = b.getBoundingClientRect();
        if (r.top > innerHeight || r.bottom < 0 || r.width === 0) continue;
        const m = /rgba?\(([\d.]+), ?([\d.]+), ?([\d.]+)/.exec(bg) || /oklch\(([\d.]+) ([\d.]+)/.exec(bg);
        // dolu vurgu: alfa 1 ve koyu/doygun zemin (beyaz/şeffaf değil)
        if (!/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)|oklch\(1 /.test(bg)) res.push({ t: (b.textContent ?? '').trim().slice(0, 20), bg, w: Math.round(r.width), h: Math.round(r.height) });
      }
      return res;
    });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
