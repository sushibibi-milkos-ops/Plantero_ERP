/**
 * gorsel-critic tur 5 — kalite modülü hedefli ölçüm (evaluate gövdeleri string; tsx keepNames sorununu önler).
 * Ölçülenler: yatay kaydırılan kaplar, ellipsis ile kırpılan yaprak metinler, viewport dışı metin,
 * tabular-nums kullanmayan sayı hücreleri, tablo satır yüksekliği/ayracı, KPI değeri–ayraç boşluğu,
 * mobilde sayfa sonunda alt gezinme çubuğu örtmesi.
 */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const COLLECT = String.raw`(() => {
  var vw = document.documentElement.clientWidth;
  var vis = function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  var all = Array.prototype.slice.call(document.querySelectorAll('*'));
  var out = {};

  var scrollers = [];
  all.forEach(function (el) {
    if (!vis(el)) return;
    if (el.scrollWidth - el.clientWidth > 2) {
      var cs = getComputedStyle(el);
      if (cs.overflowX === 'visible') return;
      scrollers.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 100), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowX: cs.overflowX, hidden: el.scrollWidth - el.clientWidth });
    }
  });
  out.horizontalScrollers = scrollers;

  var clipped = [];
  all.forEach(function (el) {
    if (!vis(el) || el.children.length > 0) return;
    if (el.scrollWidth - el.clientWidth > 1) {
      var cs = getComputedStyle(el);
      if (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden') clipped.push({ text: String(el.textContent || '').trim().slice(0, 60), w: Math.round(el.clientWidth), full: el.scrollWidth });
    }
  });
  out.clippedTexts = clipped.slice(0, 30);
  out.clippedCount = clipped.length;

  var outside = [];
  all.forEach(function (el) {
    if (!vis(el) || el.children.length > 0) return;
    var t = String(el.textContent || '').trim();
    if (!t) return;
    var r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) outside.push({ text: t.slice(0, 50), left: Math.round(r.left), right: Math.round(r.right), vw: vw });
  });
  out.outsideViewport = outside.slice(0, 20);

  var numRe = /^[₺%\s]*[-+]?[\d.,]+(\s?(KG|ADET|LT|TL|%))?\s*$/i;
  var nonTab = [];
  all.forEach(function (el) {
    if (!vis(el) || el.children.length > 0) return;
    var t = String(el.textContent || '').trim();
    if (!t || t.length > 24 || !/\d/.test(t) || !numRe.test(t)) return;
    var cs = getComputedStyle(el);
    if (!/tabular-nums/.test(cs.fontVariantNumeric || '') && !/mono/i.test(cs.fontFamily || '')) nonTab.push(t + ' @' + el.tagName.toLowerCase());
  });
  out.nonTabularNumbers = nonTab.slice(0, 25);

  var tr = all.filter(function (e) { return e.tagName === 'TR' && e.closest('tbody') && vis(e); });
  out.rowCount = tr.length;
  if (tr.length) {
    var cs0 = getComputedStyle(tr[0]);
    out.rowHeight = Math.round(tr[0].getBoundingClientRect().height);
    out.rowBorderBottom = cs0.borderBottomWidth + ' ' + cs0.borderBottomColor;
  }

  var dividers = [];
  all.forEach(function (c) {
    var cs = getComputedStyle(c);
    if (parseFloat(cs.borderLeftWidth) < 0.5) return;
    var cr = c.getBoundingClientRect();
    if (cr.height < 20 || cr.width < 1) return;
    dividers.push(cr);
  });
  var kpi = [];
  all.forEach(function (el) {
    if (!vis(el) || el.children.length > 0) return;
    var t = String(el.textContent || '').trim();
    if (!/^[\d.,]+\s?(ADET|KG|LT)?(\s*·\s*[\d.,]+\s?(ADET|KG|LT))?$/i.test(t)) return;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 18) return;
    var r = el.getBoundingClientRect();
    var gap = null;
    dividers.forEach(function (cr) {
      if (cr.left >= r.right - 1 && cr.top < r.bottom && cr.bottom > r.top) {
        var g = cr.left - r.right;
        if (gap === null || g < gap) gap = g;
      }
    });
    kpi.push({ text: t, fontSize: fs, right: Math.round(r.right), gapToDivider: gap === null ? null : Math.round(gap) });
  });
  out.kpiValues = kpi;

  var focusable = all.filter(function (e) { return vis(e) && (e.tagName === 'BUTTON' || e.tagName === 'A' || e.tagName === 'INPUT' || e.getAttribute('role') === 'button'); });
  out.interactiveCount = focusable.length;
  return out;
})()`;

const BOTTOM_NAV = String.raw`(() => {
  var navs = Array.prototype.slice.call(document.querySelectorAll('nav')).filter(function (n) { return getComputedStyle(n).position === 'fixed'; });
  var bar = navs[navs.length - 1];
  if (!bar) return { found: false };
  var br = bar.getBoundingClientRect();
  var worst = null;
  Array.prototype.slice.call(document.querySelectorAll('main *')).forEach(function (el) {
    if (el.children.length > 0) return;
    var t = String(el.textContent || '').trim();
    if (!t) return;
    var r = el.getBoundingClientRect();
    if (r.height === 0) return;
    if (r.bottom > br.top + 2 && r.top < br.bottom) { if (!worst || r.bottom > worst.bottom) worst = { text: t.slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }
  });
  return { found: true, navTop: Math.round(br.top), navHeight: Math.round(br.height), overlappedText: worst, scrollY: Math.round(window.scrollY), docH: document.body.scrollHeight };
})()`;

function parse(argv: string[]) {
  let route = '/kalite/kontroller';
  let viewport = { width: 1440, height: 900 };
  let label = 'x';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('/')) route = a;
    else if (a === '--viewport') {
      const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? '')!;
      viewport = { width: Number(m[1]), height: Number(m[2]) };
    } else if (a === '--label') label = argv[++i] ?? label;
  }
  return { route, viewport, label };
}

async function main() {
  const { route, viewport, label } = parse(process.argv.slice(2));
  const base = defaultBaseUrl();
  const mobile = viewport.width < 700;
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });
  await page.waitForTimeout(900);
  const out = await page.evaluate(COLLECT);
  let bottomNav: unknown = null;
  if (mobile) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(400);
    bottomNav = await page.evaluate(BOTTOM_NAV);
  }
  console.log(JSON.stringify({ label, route, viewport: `${viewport.width}x${viewport.height}`, ...(out as object), bottomNav }, null, 1));
  await ctx.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
