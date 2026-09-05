/**
 * Kalite modülü tur-2 ölçüm probu (gorsel-critic).
 * probe-kalite-r1 ölçümlerine ek olarak: sunucu eylemi tamamlandıktan sonra (--wait) ana içerik
 * metninin ilk 400 karakteri, tablo/kart kaydırma kapları, tabular-nums, 44px altı dokunma hedefleri.
 * Kullanım: pnpm tsx scripts/probe-kalite-r2.ts /route [--viewport 1440x900] [--wait 4000]
 * Çıktı: tek satır JSON (stdout).
 */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

function parse(argv: string[]) {
  let route = '/kalite/izlenebilirlik';
  let viewport = { width: 1440, height: 900 };
  let wait = 4000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--viewport') { const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? ''); if (m) viewport = { width: +m[1]!, height: +m[2]! }; }
    else if (a === '--wait') wait = Number(argv[++i] ?? wait);
    else if (a.startsWith('/')) route = a;
  }
  return { route, viewport, wait };
}

const COLLECT = String.raw`(() => {
  var vis = function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var all = Array.prototype.slice.call(document.querySelectorAll('*'));

  var scrollers = [];
  all.forEach(function (e) {
    if (!vis(e)) return;
    if (e.scrollWidth - e.clientWidth > 4 && e.clientWidth > 160) {
      var cs = getComputedStyle(e);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
        var cls = typeof e.className === 'string' ? e.className.split(/\s+/).slice(0, 3).join('.') : '';
        scrollers.push({ sel: e.tagName.toLowerCase() + (cls ? '.' + cls : ''), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, over: e.scrollWidth - e.clientWidth });
      }
    }
  });

  var decimals = [];
  var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var n;
  while ((n = w.nextNode())) {
    var t = (n.nodeValue || '').trim();
    var m = t.match(/\d+[.,]\d{3,}/g);
    if (m && n.parentElement && vis(n.parentElement)) decimals = decimals.concat(m);
  }

  var numCells = 0, tabular = 0, nonTabular = [];
  all.forEach(function (el) {
    if (el.children.length || !vis(el)) return;
    var t = (el.textContent || '').trim();
    if (!/\d/.test(t)) return;
    if (!/^[₺%]?\s?-?[\d.,]+(\s?(%|₺|kg|adet|g|lt))?$/.test(t)) return;
    numCells++;
    var fv = getComputedStyle(el).fontVariantNumeric || '';
    if (fv.indexOf('tabular-nums') >= 0) tabular++; else nonTabular.push(t.slice(0, 14));
  });

  var main = document.querySelector('main') || document.body;
  var small = Array.prototype.slice.call(main.querySelectorAll('a, button, input, select, textarea, [role="button"]'))
    .filter(vis)
    .map(function (el) { var r = el.getBoundingClientRect(); return { sel: el.tagName.toLowerCase() + ' "' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) + '"', w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter(function (x) { return x.h < 44; });

  var colors = {};
  all.slice(0, 600).forEach(function (el) {
    if (!vis(el)) return;
    var cs = getComputedStyle(el);
    if (cs.color) colors[cs.color] = 1;
    if (cs.backgroundColor && cs.backgroundColor.indexOf('rgba(0, 0, 0, 0)') < 0) colors[cs.backgroundColor] = 1;
  });

  var rows = Array.prototype.slice.call(document.querySelectorAll('tbody tr')).filter(vis).map(function (r) { return Math.round(r.getBoundingClientRect().height); });
  var cards = Array.prototype.slice.call(document.querySelectorAll('ul > li')).filter(vis).map(function (r) { return Math.round(r.getBoundingClientRect().height); });

  var fonts = {};
  all.forEach(function (el) {
    if (el.children.length || !vis(el)) return;
    var t = (el.textContent || '').trim();
    if (!t) return;
    var s = Math.round(parseFloat(getComputedStyle(el).fontSize));
    fonts[s] = (fonts[s] || 0) + 1;
  });

  return {
    text: (main.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    scrollers: scrollers,
    decimals: Array.from(new Set(decimals)),
    distinctColors: Object.keys(colors).length,
    numCells: numCells, tabular: tabular, nonTabular: Array.from(new Set(nonTabular)).slice(0, 20),
    smallTargets: small,
    rowHeights: rows, listItemHeights: cards, fonts: fonts,
    docScrollWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth
  };
})()`;

async function main() {
  const { route, viewport, wait } = parse(process.argv.slice(2));
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });
  await page.waitForTimeout(wait);
  const out = await page.evaluate(COLLECT);
  console.log(JSON.stringify({ route, viewport: `${viewport.width}x${viewport.height}`, url: page.url(), ...(out as object) }));
  await ctx.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
