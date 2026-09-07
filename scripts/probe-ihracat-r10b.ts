/** Tur 10b: gerçek klavye ile odak halkası + boş arama durumları + dokunma hedefleri (mobil). */
import { writeFileSync, mkdirSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const OUT = 'artifacts/screens/ihracat-r10-states';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser();
  const res: any = {};
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['belgeler', '/ihracat/belgeler'], ['kurlar', '/ihracat/kurlar'], ['gtip', '/ihracat/gtip']] as Array<[string, string]>) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    // klavye ile odak: 8 kez Tab
    const rings: any[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, label: (el.textContent ?? '').trim().slice(0, 24), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, offset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 120) };
      });
      if (r) rings.push(r);
    }
    await page.screenshot({ path: `${OUT}/${k}-focus-1440.png`, fullPage: false, animations: 'disabled' });
    // boş arama
    const search = page.locator('input[placeholder*="ara"]').first();
    let empty: any = null;
    if (await search.count()) {
      await search.fill('zzzqqq');
      await page.waitForTimeout(900);
      empty = await page.evaluate(() => {
        const m = document.querySelector('main') as HTMLElement;
        const txt = (m.innerText || '').split('\n').filter(Boolean).slice(-8);
        const svg = m.querySelectorAll('table ~ * svg, [class*="empty"] svg').length;
        return { tail: txt, svgs: svg };
      });
      await page.screenshot({ path: `${OUT}/${k}-bos-1440.png`, fullPage: false, animations: 'disabled' });
    }
    res[k] = { rings: rings.slice(0, 6), empty };
    await ctx.close();
  }
  // mobil dokunma hedefleri (etkileşimli olanlar)
  const ctxm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const pm = await ctxm.newPage();
  const t: any = {};
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['belgeler', '/ihracat/belgeler'], ['kurlar', '/ihracat/kurlar'], ['gtip', '/ihracat/gtip'], ['yeni', '/ihracat/sevkiyatlar/yeni']] as Array<[string, string]>) {
    await openRoute(pm, { base: BASE, route, as: 'admin' });
    t[k] = await pm.evaluate(() => {
      const bad: any[] = [];
      document.querySelectorAll('main a[href], main button, main [role="button"], main input, main select, main [role="tab"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.opacity === '0') return;
        if (r.height < 44 || r.width < 44) bad.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), label: (el.textContent ?? '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) });
      });
      return bad;
    });
  }
  res.mobileTouch = t;
  await ctxm.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r10b.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
