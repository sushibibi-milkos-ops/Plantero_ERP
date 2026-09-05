/**
 * Kalite modülü tur-4 ölçüm probu (gorsel-critic).
 * r3 probunun üstüne: (a) yatay kaydırıcıların uç konumda kırpma bırakıp bırakmadığı,
 * (b) viewport sağ kenarını aşan görünür metin düğümleri, (c) miktar hücrelerinde birim eki.
 * Kullanım: pnpm tsx scripts/probe-kalite-r4.ts /route [--viewport 1440x900] [--wait 3500] [--scroll-ends]
 */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

function parse(argv: string[]) {
  let route = '/kalite/kontroller';
  let viewport = { width: 1440, height: 900 };
  let wait = 3500;
  let scrollEnds = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--viewport') { const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? ''); if (m) viewport = { width: +m[1]!, height: +m[2]! }; }
    else if (a === '--wait') wait = Number(argv[++i] ?? wait);
    else if (a === '--scroll-ends') scrollEnds = true;
    else if (a.startsWith('/')) route = a;
  }
  return { route, viewport, wait, scrollEnds };
}

const SCROLL_ENDS = String.raw`(() => {
  var vis = function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var all = Array.prototype.slice.call(document.querySelectorAll('*'));
  var scrollers = all.filter(function (e) {
    if (!vis(e)) return false;
    var cs = getComputedStyle(e);
    return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth - e.clientWidth > 4;
  });
  scrollers.forEach(function (s) { s.scrollLeft = s.scrollWidth; });
  return scrollers.length;
})()`;

const COLLECT = String.raw`(() => {
  var vw = document.documentElement.clientWidth;
  var vis = function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0; };
  var sel = function (e) { var cls = typeof e.className === 'string' ? e.className.split(/\s+/).filter(Boolean).slice(0,4).join('.') : ''; return e.tagName.toLowerCase() + (cls ? '.' + cls : ''); };
  var all = Array.prototype.slice.call(document.querySelectorAll('*'));

  // (a) taşan kapsayıcılar + (b) yaprak metin kırpması
  var overflowing = [], clippedLeaves = [];
  all.forEach(function (e) {
    if (!vis(e)) return;
    var over = e.scrollWidth - e.clientWidth;
    var cs = getComputedStyle(e);
    if (over > 2 && e.clientWidth > 160) overflowing.push({ sel: sel(e), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, over: over, overflowX: cs.overflowX });
    if (over > 2 && !e.children.length && cs.overflowX !== 'visible') {
      var t = (e.textContent || '').replace(/\s+/g,' ').trim();
      if (t) clippedLeaves.push({ text: t.slice(0, 40), over: over, ellipsis: cs.textOverflow });
    }
  });

  // (c) viewport sağ kenarını aşan görünür metin düğümleri (kaydırıcı içindekiler HARİÇ değil — ayrı işaretlenir)
  var beyond = [];
  all.forEach(function (e) {
    if (e.children.length || !vis(e)) return;
    var t = (e.textContent || '').replace(/\s+/g,' ').trim();
    if (!t) return;
    var r = e.getBoundingClientRect();
    if (r.right <= vw + 0.5) return;
    var inScroller = false, p = e.parentElement;
    while (p) { var pcs = getComputedStyle(p); if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') { inScroller = true; break; } p = p.parentElement; }
    beyond.push({ text: t.slice(0, 40), right: Math.round(r.right), vw: vw, over: Math.round(r.right - vw), inScroller: inScroller });
  });

  // miktar sütunlarında birim eki: "Red miktarı" vb. başlıklı sütunların hücreleri
  var tables = Array.prototype.slice.call(document.querySelectorAll('table'));
  var qtyCols = [];
  tables.forEach(function (tb) {
    var ths = Array.prototype.slice.call(tb.querySelectorAll('thead th'));
    ths.forEach(function (th, i) {
      var head = (th.textContent || '').replace(/\s+/g,' ').trim();
      if (!/miktar|tutar|adet|kg/i.test(head)) return;
      var cells = Array.prototype.slice.call(tb.querySelectorAll('tbody tr')).map(function (tr) {
        var td = tr.children[i]; return td ? (td.textContent || '').replace(/\s+/g,' ').trim() : '';
      });
      qtyCols.push({ head: head, cells: cells });
    });
  });

  var numCells = 0, tabular = 0, nonTabular = [];
  all.forEach(function (el) {
    if (el.children.length || !vis(el)) return;
    var t = (el.textContent || '').trim();
    if (!/\d/.test(t)) return;
    if (!/^[₺%]?\s?-?[\d.,]+(\s?(%|₺|kg|KG|adet|ADET|g|lt|LT|gün))?$/.test(t)) return;
    numCells++;
    var fv = getComputedStyle(el).fontVariantNumeric || '';
    if (fv.indexOf('tabular-nums') >= 0) tabular++; else nonTabular.push(t.slice(0, 16));
  });

  var main = document.querySelector('main') || document.body;
  var small = Array.prototype.slice.call(main.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="tab"], summary'))
    .filter(vis)
    .map(function (el) { var r = el.getBoundingClientRect(); return { sel: el.tagName.toLowerCase() + ' "' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) + '"', w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter(function (x) { return x.h < 44; });

  var rows = Array.prototype.slice.call(document.querySelectorAll('tbody tr')).filter(vis).map(function (r) { return Math.round(r.getBoundingClientRect().height); });
  var cards = Array.prototype.slice.call(document.querySelectorAll('ul > li')).filter(vis).map(function (r) { return Math.round(r.getBoundingClientRect().height); });

  var fonts = {};
  all.forEach(function (el) {
    if (el.children.length || !vis(el)) return;
    if (!(el.textContent || '').trim()) return;
    var s = Math.round(parseFloat(getComputedStyle(el).fontSize));
    fonts[s] = (fonts[s] || 0) + 1;
  });

  var h1 = document.querySelector('h1');
  var h1s = h1 ? { text: (h1.textContent||'').trim().slice(0,40), size: getComputedStyle(h1).fontSize, weight: getComputedStyle(h1).fontWeight, ls: getComputedStyle(h1).letterSpacing } : null;

  return {
    text: (main.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    overflowing: overflowing, clippedLeaves: clippedLeaves.slice(0, 25), clippedCount: clippedLeaves.length,
    beyondViewport: beyond.slice(0, 20), beyondCount: beyond.length,
    qtyCols: qtyCols,
    numCells: numCells, tabular: tabular, nonTabular: Array.from(new Set(nonTabular)).slice(0, 20),
    smallTargets: small, smallCount: small.length,
    rowHeights: rows, listItemHeights: cards, fonts: fonts, h1: h1s,
    docScrollWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth
  };
})()`;

async function main() {
  const { route, viewport, wait, scrollEnds } = parse(process.argv.slice(2));
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });
  await page.waitForTimeout(wait);
  let scrollerCount = 0;
  if (scrollEnds) { scrollerCount = (await page.evaluate(SCROLL_ENDS)) as number; await page.waitForTimeout(400); }
  const out = await page.evaluate(COLLECT);
  console.log(JSON.stringify({ route, viewport: `${viewport.width}x${viewport.height}`, url: page.url(), scrolledToEnd: scrollEnds, scrollerCount, ...(out as object) }));
  await ctx.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
