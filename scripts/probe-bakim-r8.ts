/**
 * Tur 8 kritik ölçümü — /bakim/oee trend grafiği ekseni ve seri ayırt edilebilirliği.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var yTicks = Array.prototype.slice.call(document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value')).map(function (t) { return (t.textContent||'').trim(); });
  var grids = Array.prototype.slice.call(document.querySelectorAll('.recharts-cartesian-grid-horizontal line')).map(function (l) { return Number(l.getAttribute('y1')); });
  var curves = Array.prototype.slice.call(document.querySelectorAll('.recharts-area-curve, .recharts-line-curve')).map(function (p) {
    var bb = p.getBBox();
    var cs = getComputedStyle(p);
    return { stroke: p.getAttribute('stroke') || cs.stroke, dash: p.getAttribute('stroke-dasharray') || cs.strokeDasharray, w: p.getAttribute('stroke-width') || cs.strokeWidth, top: Math.round(bb.y*100)/100, bottom: Math.round((bb.y+bb.height)*100)/100 };
  });
  var surf = document.querySelector('.recharts-surface');
  var plotH = surf ? surf.getBBox().height : null;
  var gridTop = grids.length ? Math.min.apply(null, grids) : null;
  var gridBot = grids.length ? Math.max.apply(null, grids) : null;
  var minCurveTop = curves.length ? Math.min.apply(null, curves.map(function(c){return c.top;})) : null;
  // KPI şeridi
  var strip = document.querySelector('[data-slot="kpi-strip"], [class*="kpi"]');
  var kpi = null;
  if (strip) kpi = { sw: strip.scrollWidth, cw: strip.clientWidth };
  return { yTicks: yTicks, grids: grids, gridTop: gridTop, gridBot: gridBot, plotH: plotH,
    minCurveTop: minCurveTop,
    deadTopPx: (gridTop!==null&&minCurveTop!==null)?Math.round((minCurveTop-gridTop)*100)/100:null,
    curves: curves, kpi: kpi };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await context.newPage();
    await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
    const res = await page.evaluate(COLLECT);
    console.log(JSON.stringify({ vp: `${vp.width}x${vp.height}`, ...(res as object) }, null, 1));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
