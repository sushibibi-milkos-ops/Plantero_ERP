/** Viewport sağ kenarını aşan görünür öğeler (yalnız yaprak değil, buton/kap da) — tur 3. */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
const COLLECT = String.raw`(() => {
  var vw = document.documentElement.clientWidth;
  var out = [];
  var main = document.querySelector('main') || document.body;
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (r.right <= vw + 0.5) return;
    // kaydırılabilir bir atanın içindeyse (bilinçli yatay kaydırma) atla
    var p = el.parentElement, inScroller = false;
    while (p) { var cs = getComputedStyle(p); if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 2) { inScroller = true; break; } p = p.parentElement; }
    if (inScroller) return;
    var cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0,3).join('.') : '';
    out.push({ sel: el.tagName.toLowerCase() + (cls ? '.' + cls : ''), text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,32), right: Math.round(r.right), hiddenPx: Math.round(r.right - vw) });
  });
  return { vw: vw, clipped: out.slice(0, 20), count: out.length, docScrollWidth: document.documentElement.scrollWidth };
})()`;
async function main() {
  const argv = process.argv.slice(2);
  const route = argv.find((a) => a.startsWith('/'))!;
  const vpArg = argv.includes('--viewport') ? argv[argv.indexOf('--viewport') + 1]! : '390x844';
  const [w, h] = vpArg.split('x').map(Number) as [number, number];
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route, as: 'admin' });
  await page.waitForTimeout(1200);
  console.log(JSON.stringify({ route, viewport: vpArg, ...(await page.evaluate(COLLECT) as object) }));
  await ctx.close(); await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
