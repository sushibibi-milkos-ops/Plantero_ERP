/** Tur 12: 1024x768 (operatör/tablet) tablo taşma ölçümü + sekme altı tablo genişlikleri. */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = 'd9e73bbe-dabd-4bee-90f9-c0537d394bfa';

async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    const per: any = {};
    for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['belgeler', '/ihracat/belgeler'], ['kurlar', '/ihracat/kurlar'], ['gtip', '/ihracat/gtip'], ['detay', `/ihracat/sevkiyatlar/${SHIP}`]] as Array<[string, string]>) {
      await openRoute(page, { base: BASE, route, as: 'admin' });
      per[k] = await page.evaluate(() => {
        const de = document.documentElement;
        const t = document.querySelector('table') as HTMLElement | null;
        if (!t) return { page: { sw: de.scrollWidth, cw: de.clientWidth } , table: null };
        // en yakın kaydırılabilir kapsayıcı
        let el: HTMLElement | null = t.parentElement;
        let wrap: HTMLElement | null = null;
        while (el) { const cs = getComputedStyle(el); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflow === 'auto') { wrap = el; break; } el = el.parentElement; }
        const heads = Array.from(t.querySelectorAll('thead th')).map((th) => ({ h: (th.textContent ?? '').trim(), right: Math.round(th.getBoundingClientRect().right) }));
        return {
          page: { sw: de.scrollWidth, cw: de.clientWidth },
          table: { tableW: Math.round(t.getBoundingClientRect().width), wrapClientW: wrap ? wrap.clientWidth : null, wrapScrollW: wrap ? wrap.scrollWidth : null, wrapClass: wrap ? (wrap.className || '').toString().slice(0, 80) : null },
          clippedCols: heads.filter((x) => x.right > window.innerWidth).map((x) => x.h),
          viewportW: window.innerWidth,
        };
      });
    }
    out[`${w}x${h}`] = per;
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r12b.json', JSON.stringify(out, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
