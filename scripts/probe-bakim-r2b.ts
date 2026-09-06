/** Tur 2 — iskelet/gerçek karşılaştırması ve blok geometrisi (bakım). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const main = document.querySelector('main');
  const root = main?.firstElementChild ?? main;
  const blocks = root ? Array.from(root.children).map((el) => ({ h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), top: Math.round(el.getBoundingClientRect().top + window.scrollY), text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 46) })) : [];
  // grid hücreleri (StatCell vb.)
  const cells: unknown[] = [];
  for (const g of Array.from(document.querySelectorAll<HTMLElement>('main [class*="grid"]'))) {
    if (g.children.length >= 2 && g.children.length <= 12) {
      cells.push({ cls: (g.className || '').toString().slice(0, 70), children: Array.from(g.children).map((el) => ({ h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width), text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 30) })) });
    }
  }
  // ARIA/odak: klavyeyle erişilebilir kart var mı
  const tabbables = Array.from(document.querySelectorAll<HTMLElement>('main [tabindex="0"], main a[href], main button')).length;
  return { blocks, cells: cells.slice(0, 4), tabbables, docHeight: document.documentElement.scrollHeight };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const results: unknown[] = [];
  for (const spec of process.argv.slice(2)) {
    const [route, vp] = spec.split('|');
    const [w, h] = (vp ?? '1440x900').split('x').map(Number);
    const ctx = await browser.newContext({ viewport: { width: w!, height: h! }, isMobile: w! < 500, hasTouch: w! < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    try {
      await openRoute(page, { base, route: route!, as: 'admin' });
      results.push({ route, viewport: `${w}x${h}`, ...(await page.evaluate(collect)) });
    } catch (e) {
      results.push({ route, viewport: `${w}x${h}`, error: String(e).slice(0, 180) });
    }
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(results, null, 1));
}

main();
