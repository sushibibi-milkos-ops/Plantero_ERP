/**
 * Tur 6 — gorsel-critic /bakim ölçümleri.
 * - emptyBelow (ana sütun ölü alan), iç kaydırıcılar (scrollHeight/scrollWidth > client)
 * - Recharts: etkileşimsiz açılışta aktif nokta/tooltip, seri y konumu vs. üst gridline
 * - 390px: dokunma hedefleri, KPI şeridi taşması, sabit alt çubuk örtmesi
 * Not: tarayıcı içi kod string olarak geçirilir (tsx/esbuild `__name` sarmalayıcısı evaluate içinde tanımsız).
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var main = document.querySelector('main') || document.body;
  var vh = window.innerHeight;
  var lastBottom = 0;
  var innerScrollers = [];
  var sel = function (el) {
    var t = el.tagName.toLowerCase();
    var c = (el.className && typeof el.className === 'string' ? el.className : '').split(/\\s+/).slice(0, 4).join('.');
    var txt = (el.textContent || '').trim().slice(0, 28);
    return t + (c ? '.' + c : '') + ' "' + txt + '"';
  };
  var all = Array.prototype.slice.call(main.querySelectorAll('*'));
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0 && r.bottom > lastBottom && r.bottom < 100000) lastBottom = r.bottom;
    if (r.height > 0 && r.width > 0) {
      var sw = el.scrollWidth, cw = el.clientWidth, sh = el.scrollHeight, ch = el.clientHeight;
      if ((sw > cw + 4 || sh > ch + 4) && cw > 0 && ch > 0) innerScrollers.push({ sel: sel(el), sw: sw, cw: cw, sh: sh, ch: ch });
    }
  }
  var activeDots = document.querySelectorAll('.recharts-active-dot').length;
  var tooltipWrappers = Array.prototype.slice.call(document.querySelectorAll('.recharts-tooltip-wrapper')).map(function (e) {
    var r = e.getBoundingClientRect(); var st = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), visibility: st.visibility, text: (e.textContent || '').trim().slice(0, 40) };
  });
  var grids = Array.prototype.slice.call(document.querySelectorAll('.recharts-cartesian-grid-horizontal line')).map(function (l) { return Number(l.getAttribute('y1')); });
  var curves = Array.prototype.slice.call(document.querySelectorAll('.recharts-area-curve')).map(function (p) {
    var bb = p.getBBox();
    return { stroke: (p.getAttribute('stroke') || '').slice(0, 46), dash: p.getAttribute('stroke-dasharray') || '', y: Math.round(bb.y), h: Math.round(bb.height) };
  });
  var surf = document.querySelector('.recharts-surface');
  var plot = surf ? surf.getBoundingClientRect() : null;
  var strip = document.querySelector('[data-slot="kpi-strip"], [class*="snap-x"]');
  var stripInfo = strip ? { sw: strip.scrollWidth, cw: strip.clientWidth } : null;
  var fixed = Array.prototype.slice.call(document.querySelectorAll('*')).filter(function (e) {
    var st = getComputedStyle(e);
    return (st.position === 'fixed' || st.position === 'sticky') && e.getBoundingClientRect().height > 24;
  }).map(function (e) { var r = e.getBoundingClientRect(); return { sel: sel(e), pos: getComputedStyle(e).position, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; }).slice(0, 8);
  var small = Array.prototype.slice.call(main.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="tab"]')).filter(function (e) {
    var r = e.getBoundingClientRect(); var st = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.opacity !== '0' && (r.width < 44 || r.height < 44);
  }).map(function (e) { var r = e.getBoundingClientRect(); return { sel: sel(e), w: Math.round(r.width), h: Math.round(r.height) }; }).slice(0, 12);
  return {
    docHeight: Math.round(document.documentElement.scrollHeight),
    viewportHeight: vh,
    lastContentBottom: Math.round(lastBottom),
    emptyBelow: Math.round(vh - lastBottom),
    innerScrollers: innerScrollers.slice(0, 8),
    activeDots: activeDots, tooltipWrappers: tooltipWrappers,
    gridTop: grids.length ? Math.min.apply(null, grids) : null,
    plotTop: plot ? Math.round(plot.top) : null,
    curves: curves, stripInfo: stripInfo, fixed: fixed, small: small
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const targets: Array<{ route: string; vp: { width: number; height: number } }> = [
    { route: '/bakim/oee', vp: { width: 1440, height: 900 } },
    { route: '/bakim/oee', vp: { width: 390, height: 844 } },
    { route: '/bakim/is-emirleri', vp: { width: 1440, height: 900 } },
    { route: '/bakim/planlar', vp: { width: 1440, height: 900 } },
    { route: '/bakim/is-emirleri/yeni', vp: { width: 390, height: 844 } },
    { route: '/bakim/is-emirleri/yeni', vp: { width: 1440, height: 900 } },
    { route: '/bakim/makineler', vp: { width: 1440, height: 900 } },
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
