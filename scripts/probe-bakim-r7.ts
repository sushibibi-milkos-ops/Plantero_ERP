/**
 * Tur 7 — gorsel-critic /bakim ölçümleri.
 * - açık P2'lerin yeniden ölçümü (KPI şeridi taşması, OEE üst gridline payı)
 * - mobil DataTable kartında alt satır metni ile sağa hizalı değerin arasındaki boşluk
 * - iş emri detayında fotoğraf küçük resminin kutu içi doluluk oranı
 * - makine detayında sağ sütun ölü alanı
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const COLLECT = `(() => {
  var main = document.querySelector('main') || document.body;
  var vh = window.innerHeight;
  var sel = function (el) {
    var t = el.tagName.toLowerCase();
    var c = (el.className && typeof el.className === 'string' ? el.className : '').split(/\\s+/).slice(0, 4).join('.');
    var txt = (el.textContent || '').trim().slice(0, 30);
    return t + (c ? '.' + c : '') + ' "' + txt + '"';
  };
  // 1) KPI şeridi
  var strip = document.querySelector('[data-slot="kpi-strip"], [class*="snap-x"]');
  var stripInfo = null;
  if (strip) {
    var kids = Array.prototype.slice.call(strip.children).map(function (k) {
      var r = k.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), fullyVisible: r.right <= window.innerWidth + 1 };
    });
    stripInfo = { sw: strip.scrollWidth, cw: strip.clientWidth, kids: kids, fullyVisibleCount: kids.filter(function (k) { return k.fullyVisible; }).length };
  }
  // 2) recharts
  var activeDots = document.querySelectorAll('.recharts-active-dot').length;
  var grids = Array.prototype.slice.call(document.querySelectorAll('.recharts-cartesian-grid-horizontal line')).map(function (l) { return Number(l.getAttribute('y1')); });
  var curves = Array.prototype.slice.call(document.querySelectorAll('.recharts-area-curve')).map(function (p) {
    var bb = p.getBBox();
    return { stroke: (p.getAttribute('stroke') || '').slice(0, 40), dash: p.getAttribute('stroke-dasharray') || '', y: Math.round(bb.y * 100) / 100, h: Math.round(bb.height) };
  });
  var minCurveY = curves.length ? Math.min.apply(null, curves.map(function (c) { return c.y; })) : null;
  var gridTop = grids.length ? Math.min.apply(null, grids) : null;
  // 3) mobil kart: alt satır metni ile sağdaki değer arası boşluk
  var cardGaps = [];
  var lis = Array.prototype.slice.call(main.querySelectorAll('ul > li'));
  for (var i = 0; i < lis.length && cardGaps.length < 40; i++) {
    var leafs = Array.prototype.slice.call(lis[i].querySelectorAll('*')).filter(function (e) {
      return e.children.length === 0 && (e.textContent || '').trim().length > 0 && e.getBoundingClientRect().width > 0;
    });
    for (var a = 0; a < leafs.length; a++) {
      for (var b = 0; b < leafs.length; b++) {
        if (a === b) continue;
        var ra = leafs[a].getBoundingClientRect(), rb = leafs[b].getBoundingClientRect();
        var sameRow = Math.abs((ra.top + ra.bottom) / 2 - (rb.top + rb.bottom) / 2) < 8;
        if (sameRow && rb.left >= ra.right - 1) {
          var gap = Math.round((rb.left - ra.right) * 10) / 10;
          if (gap < 8) cardGaps.push({ card: i, gap: gap, left: (leafs[a].textContent || '').trim().slice(0, 34), right: (leafs[b].textContent || '').trim().slice(0, 18) });
        }
      }
    }
  }
  // 4) görseller
  var imgs = Array.prototype.slice.call(main.querySelectorAll('img')).map(function (im) {
    var r = im.getBoundingClientRect();
    var box = im.parentElement ? im.parentElement.getBoundingClientRect() : r;
    return { w: Math.round(r.width), h: Math.round(r.height), natW: im.naturalWidth, natH: im.naturalHeight, src: (im.currentSrc || im.src || '').slice(0, 70), boxW: Math.round(box.width), boxH: Math.round(box.height) };
  });
  // 5) ana sütun ölü alanı ve sağ sütun boşluğu
  var lastBottom = 0; var innerScrollers = [];
  var all = Array.prototype.slice.call(main.querySelectorAll('*'));
  for (var j = 0; j < all.length; j++) {
    var el = all[j]; var r2 = el.getBoundingClientRect();
    if (r2.height > 0 && r2.width > 0 && r2.bottom > lastBottom && r2.bottom < 100000) lastBottom = r2.bottom;
    if (r2.height > 0 && r2.width > 0) {
      var sw = el.scrollWidth, cw = el.clientWidth, sh = el.scrollHeight, ch = el.clientHeight;
      if ((sw > cw + 4 || sh > ch + 4) && cw > 0 && ch > 0) innerScrollers.push({ sel: sel(el), sw: sw, cw: cw, sh: sh, ch: ch, fade: /scroll-fade/.test(el.className || '') });
    }
  }
  return {
    docHeight: Math.round(document.documentElement.scrollHeight),
    viewportHeight: vh,
    emptyBelow: Math.round(vh - lastBottom),
    stripInfo: stripInfo,
    activeDots: activeDots,
    gridTop: gridTop, minCurveY: minCurveY, topPad: (gridTop !== null && minCurveY !== null) ? Math.round((minCurveY - gridTop) * 100) / 100 : null,
    curves: curves,
    cardGaps: cardGaps.slice(0, 12),
    imgs: imgs.slice(0, 6),
    innerScrollers: innerScrollers.slice(0, 8)
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const wo = '8ac32a70-5fc6-4c22-a620-ebd2df1c2efc';
  const mk = 'fa4499ea-5547-4a4b-afb5-998b13bf0f73';
  const targets: Array<{ route: string; vp: { width: number; height: number } }> = [
    { route: '/bakim/oee', vp: { width: 1440, height: 900 } },
    { route: '/bakim/oee', vp: { width: 390, height: 844 } },
    { route: '/bakim/makineler', vp: { width: 390, height: 844 } },
    { route: '/bakim/planlar', vp: { width: 390, height: 844 } },
    { route: '/bakim/is-emirleri', vp: { width: 390, height: 844 } },
    { route: `/bakim/is-emirleri/${wo}`, vp: { width: 1440, height: 900 } },
    { route: `/bakim/is-emirleri/${wo}`, vp: { width: 390, height: 844 } },
    { route: `/bakim/makineler/${mk}`, vp: { width: 1440, height: 900 } },
    { route: '/bakim/is-emirleri/yeni', vp: { width: 390, height: 844 } },
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
