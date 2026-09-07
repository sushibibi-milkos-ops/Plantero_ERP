/**
 * Tur 8 kritik ölçümü — bakim-oee-13 kapanış doğrulaması: /bakim/oee trend grafiği Y ekseni
 * tavanı ve en üst serinin üstündeki ölü bant oranı.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  // Bu recharts sürümünde tick "line"ları (.recharts-yAxis) ve tick "label"ları
  // (.recharts-yAxis-tick-labels) ayrı z-index katmanlarında kardeş gruplardır — etiket metni
  // .recharts-yAxis'in İÇİNDE değildir, bu yüzden ayrı sorgulanır (bkz. Tur 8f doğrulama notu).
  var yTicks = Array.prototype.slice.call(document.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')).map(function (t) { return (t.textContent||'').trim(); });
  var grids = Array.prototype.slice.call(document.querySelectorAll('.recharts-cartesian-grid-horizontal line')).map(function (l) { return Number(l.getAttribute('y1')); });
  var curves = Array.prototype.slice.call(document.querySelectorAll('.recharts-area-curve, .recharts-line-curve')).map(function (p) {
    var bb = p.getBBox();
    var cs = getComputedStyle(p);
    return { stroke: p.getAttribute('stroke') || cs.stroke, top: Math.round(bb.y*100)/100, bottom: Math.round((bb.y+bb.height)*100)/100 };
  });
  var gridTop = grids.length ? Math.min.apply(null, grids) : null;
  var gridBot = grids.length ? Math.max.apply(null, grids) : null;
  var plotBand = (gridTop!==null&&gridBot!==null) ? (gridBot-gridTop) : null;
  var minCurveTop = curves.length ? Math.min.apply(null, curves.map(function(c){return c.top;})) : null;
  var deadTopPx = (gridTop!==null&&minCurveTop!==null)?Math.round((minCurveTop-gridTop)*100)/100:null;
  var deadTopPct = (deadTopPx!==null&&plotBand)?Math.round((deadTopPx/plotBand)*1000)/10:null;
  return { yTicks: yTicks, gridTop: gridTop, gridBot: gridBot, plotBand: plotBand, minCurveTop: minCurveTop, deadTopPx: deadTopPx, deadTopPct: deadTopPct, curves: curves };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await context.newPage();
    await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
    await page.waitForSelector('.recharts-yAxis text', { timeout: 15_000 }).catch(() => {});
    const res = await page.evaluate(COLLECT);
    console.log(JSON.stringify({ vp: `${vp.width}x${vp.height}`, ...(res as object) }, null, 1));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
