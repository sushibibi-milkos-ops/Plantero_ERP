/** Viewport sağ kenarını aşan görünür metin düğümleri (sessiz kırpma) — tur 3. */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const COLLECT = String.raw`(() => {
  var vw = document.documentElement.clientWidth;
  var out = [];
  var els = Array.prototype.slice.call(document.querySelectorAll('*'));
  els.forEach(function (el) {
    if (el.children.length) return;
    var t = (el.textContent || '').replace(/\s+/g,' ').trim();
    if (!t) return;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (r.right > vw + 0.5) out.push({ text: t.slice(0, 40), right: Math.round(r.right), vw: vw, hiddenPx: Math.round(r.right - vw) });
  });
  return { vw: vw, clippedByViewport: out, docScrollWidth: document.documentElement.scrollWidth };
})()`;

async function main() {
  const argv = process.argv.slice(2);
  const route = argv.find((a) => a.startsWith('/')) ?? '/kalite/izlenebilirlik?lot=PL-260808-H1-12';
  const vpArg = argv.includes('--viewport') ? argv[argv.indexOf('--viewport') + 1]! : '390x844';
  const [w, h] = vpArg.split('x').map(Number) as [number, number];
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route, as: 'admin' });
  await page.waitForSelector('text=Miktar dengesi', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  console.log(JSON.stringify({ route, viewport: vpArg, ...(await page.evaluate(COLLECT) as object) }));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
