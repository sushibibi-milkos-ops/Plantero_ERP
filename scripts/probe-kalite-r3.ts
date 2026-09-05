/**
 * Kalite modülü tur-3 ölçüm probu (gorsel-critic).
 * r2 ölçümlerine ek: overflow ayarından bağımsız TÜM taşan kapsayıcılar ve
 * kırpılan yaprak düğümler (scrollWidth>clientWidth, overflow!=visible).
 * Kullanım: pnpm tsx scripts/probe-kalite-r3.ts /route [--viewport 1440x900] [--wait 3500]
 */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

function parse(argv: string[]) {
  let route = '/kalite/kontroller';
  let viewport = { width: 1440, height: 900 };
  let wait = 3500;
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
  var sel = function (e) { var cls = typeof e.className === 'string' ? e.className.split(/\s+/).filter(Boolean).slice(0,4).join('.') : ''; return e.tagName.toLowerCase() + (cls ? '.' + cls : ''); };
  var all = Array.prototype.slice.call(document.querySelectorAll('*'));

  var overflowing = [], clipped = [];
  all.forEach(function (e) {
    if (!vis(e)) return;
    var over = e.scrollWidth - e.clientWidth;
    if (over <= 2) return;
    var cs = getComputedStyle(e);
    if (e.clientWidth > 160) overflowing.push({ sel: sel(e), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, over: over, overflowX: cs.overflowX });
    if (!e.children.length && cs.overflowX !== 'visible') {
      var t = (e.textContent || '').replace(/\s+/g,' ').trim();
      if (t) clipped.push({ text: t.slice(0, 30), scrollWidth: e.scrollWidth, clientWidth: e.clientWidth });
    }
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

  var colors = {};
  all.forEach(function (el) {
    if (!vis(el)) return;
    var cs = getComputedStyle(el);
    var t = (el.textContent||'').trim();
    if (t && !el.children.length && cs.color) colors['t:'+cs.color] = (colors['t:'+cs.color]||0)+1;
    if (cs.backgroundColor && cs.backgroundColor.indexOf('rgba(0, 0, 0, 0)') < 0) colors['b:'+cs.backgroundColor] = (colors['b:'+cs.backgroundColor]||0)+1;
  });

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
    text: (main.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    overflowing: overflowing, clipped: clipped.slice(0, 25), clippedCount: clipped.length,
    colors: colors,
    numCells: numCells, tabular: tabular, nonTabular: Array.from(new Set(nonTabular)).slice(0, 20),
    smallTargets: small, smallCount: small.length,
    rowHeights: rows, listItemHeights: cards, fonts: fonts, h1: h1s,
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
