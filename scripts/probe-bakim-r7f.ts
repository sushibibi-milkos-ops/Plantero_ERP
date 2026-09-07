/**
 * Tur 7 düzeltme doğrulaması — bakim-oee-12 (P2).
 * /bakim/oee trend grafiğinde en üst seri ile grafiğin üst kenarı arasındaki payı ölçer.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var grids = Array.prototype.slice.call(document.querySelectorAll('.recharts-cartesian-grid-horizontal line')).map(function (l) { return Number(l.getAttribute('y1')); });
  var curves = Array.prototype.slice.call(document.querySelectorAll('.recharts-area-curve')).map(function (p) {
    var bb = p.getBBox();
    return { stroke: (p.getAttribute('stroke') || '').slice(0, 40), y: Math.round(bb.y * 100) / 100 };
  });
  var minCurveY = curves.length ? Math.min.apply(null, curves.map(function (c) { return c.y; })) : null;
  var gridTop = grids.length ? Math.min.apply(null, grids) : null;
  return {
    gridTop: gridTop, minCurveY: minCurveY,
    topPad: (gridTop !== null && minCurveY !== null) ? Math.round((minCurveY - gridTop) * 100) / 100 : null,
    curves: curves,
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const targets = [
    { route: '/bakim/oee', vp: { width: 1440, height: 900 } },
    { route: '/bakim/oee', vp: { width: 390, height: 844 } },
  ];
  const browser = await launchBrowser();
  for (const t of targets) {
    const context = await browser.newContext({ viewport: t.vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await context.newPage();
    await openRoute(page, { route: t.route, base, as: 'admin' });
    const res = await page.evaluate(COLLECT);
    console.log(JSON.stringify({ route: t.route, vp: `${t.vp.width}x${t.vp.height}`, ...(res as object) }));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
