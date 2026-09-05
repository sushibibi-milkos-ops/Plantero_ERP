import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function open(browser: Awaited<ReturnType<typeof launchBrowser>>, route: string, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR' });
  const page = await ctx.newPage(); await openRoute(page, { base, route, as: 'satin_alma' }); return { ctx, page };
}
const odd = () => Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0 && (e.textContent ?? '').trim()).map((e) => {
  const r = e.getBoundingClientRect(); if (r.width <= 0) return null; const cs = getComputedStyle(e);
  const s = Math.round(parseFloat(cs.fontSize));
  return { s, w: cs.fontWeight, t: (e.textContent ?? '').trim().slice(0, 40), cls: (e as HTMLElement).className.toString().slice(0, 60) };
}).filter((x): x is NonNullable<typeof x> => !!x && ![10, 11, 12, 13, 14, 20, 24].includes(x.s));
async function main() {
  const browser = await launchBrowser(); const out: Record<string, unknown> = {};
  { const { ctx, page } = await open(browser, '/satin-alma/kritik-stok'); out.kritikOdd = await page.evaluate(odd); await ctx.close(); }
  { const { ctx, page } = await open(browser, '/satin-alma/kritik-stok', 390, 844);
    out.kritikMobileRow = await page.evaluate(() => Array.from(document.querySelectorAll('main ul > li')).slice(0,2).map((li) => {
      const r = li.getBoundingClientRect();
      return { role: li.getAttribute('role'), tabindex: li.getAttribute('tabindex'), inner: li.innerHTML.slice(0,300), h: Math.round(r.height) };
    })); await ctx.close(); }
  { const { ctx, page } = await open(browser, '/satin-alma/tedarikciler', 390, 844);
    out.tedMobileRow = await page.evaluate(() => Array.from(document.querySelectorAll('main ul > li')).slice(0,1).map((li) => ({ role: li.getAttribute('role'), tabindex: li.getAttribute('tabindex'), inner: li.innerHTML.slice(0,700) }))); await ctx.close(); }
  await browser.close(); writeFileSync('artifacts/critic/probe-tedarik-r5e.json', JSON.stringify(out, null, 1)); console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
