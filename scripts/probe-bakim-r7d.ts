/** Tur 7 — /bakim/oee @390 açılışta aktif nokta tekrar ölçümü (3x) + üst gridline payı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const Q = `(() => {
  var grids = Array.prototype.slice.call(document.querySelectorAll('.recharts-cartesian-grid-horizontal line')).map(function (l) { return Number(l.getAttribute('y1')); });
  var curves = Array.prototype.slice.call(document.querySelectorAll('.recharts-area-curve')).map(function (p) { return Math.round(p.getBBox().y * 100) / 100; });
  return { activeDots: document.querySelectorAll('.recharts-active-dot').length,
           tooltips: document.querySelectorAll('.recharts-tooltip-wrapper').length,
           gridTop: grids.length ? Math.min.apply(null, grids) : null,
           minCurveY: curves.length ? Math.min.apply(null, curves) : null };
})()`;
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
    console.log(`run${i + 1}`, JSON.stringify(await page.evaluate(Q)));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
