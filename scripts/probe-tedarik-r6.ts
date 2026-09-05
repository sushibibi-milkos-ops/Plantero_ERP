import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PO = process.env.PO_ID!;

const DESKTOP_SRC = `(() => {
  var vis = function (el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  var main = document.querySelector('main');
  var leaves = Array.prototype.slice.call(main.querySelectorAll('*')).filter(function (e) {
    return e.children.length === 0 && (e.textContent || '').trim() && vis(e);
  });
  var sizes = {}, colors = {};
  leaves.forEach(function (el) {
    var s = String(Math.round(parseFloat(getComputedStyle(el).fontSize)));
    sizes[s] = (sizes[s] || 0) + 1;
    var c = getComputedStyle(el).color;
    colors[c] = (colors[c] || 0) + 1;
  });
  var primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  var bgEls = [];
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function (el) {
    if (!vis(el)) return;
    var bg = getComputedStyle(el).backgroundColor;
    var m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(bg);
    if (!m) return;
    if (m[4] !== undefined && Number(m[4]) === 0) return;
    var r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 40) return;
    var rect = el.getBoundingClientRect();
    bgEls.push({ tag: el.tagName.toLowerCase(), txt: (el.textContent || '').trim().slice(0, 24), bg: bg, w: Math.round(rect.width), h: Math.round(rect.height) });
  });
  var table = main.querySelector('table');
  var cols = [], scroller = null;
  if (table) {
    var heads = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function (th) { return (th.textContent || '').trim(); });
    var bodyRows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    for (var i = 0; i < heads.length; i++) {
      var vals = [], ell = 0, maxClip = 0;
      for (var j = 0; j < bodyRows.length; j++) {
        var td = bodyRows[j].children[i];
        if (!td) continue;
        vals.push((td.textContent || '').trim());
        var cands = [td].concat(Array.prototype.slice.call(td.querySelectorAll('*')));
        for (var k = 0; k < cands.length; k++) {
          var c2 = cands[k];
          if (c2.scrollWidth > c2.clientWidth + 1 && getComputedStyle(c2).textOverflow === 'ellipsis') {
            ell++; maxClip = Math.max(maxClip, c2.scrollWidth - c2.clientWidth); break;
          }
        }
      }
      var th = table.querySelector('thead th:nth-child(' + (i + 1) + ')');
      var uniq = {}; vals.forEach(function (v) { uniq[v] = 1; });
      cols.push({ i: i, head: heads[i], rows: vals.length, uniq: Object.keys(uniq).length,
        empty: vals.filter(function (v) { return v === '—' || v === ''; }).length,
        ellipsis: ell, maxClipPx: maxClip, width: th ? Math.round(th.getBoundingClientRect().width) : null });
    }
    var node = table.parentElement;
    while (node && node !== main) {
      if (node.scrollWidth > node.clientWidth) { scroller = { sw: node.scrollWidth, cw: node.clientWidth, over: node.scrollWidth - node.clientWidth }; break; }
      node = node.parentElement;
    }
    if (!scroller) { var p = table.parentElement; scroller = { sw: p.scrollWidth, cw: p.clientWidth, over: p.scrollWidth - p.clientWidth }; }
  }
  var chain = Array.prototype.slice.call(main.querySelectorAll('*')).filter(function (e) {
    return e.children.length === 0 && /^(PO|GR|PINV)-\\d{4}-\\d+$/.test((e.textContent || '').trim());
  }).map(function (e) { var r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim(), top: Math.round(r.top), left: Math.round(r.left) }; });
  var switches = Array.prototype.slice.call(main.querySelectorAll('[role="switch"]')).map(function (e) {
    var r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(e).backgroundColor };
  });
  return { sizes: sizes, colors: Object.keys(colors).map(function (c) { return [c, colors[c]]; }).sort(function (a, b) { return b[1] - a[1]; }),
    primary: primary, bgEls: bgEls, cols: cols, scroller: scroller, chain: chain, switches: switches, mainW: Math.round(main.getBoundingClientRect().width) };
})()`;

const MOBILE_SRC = `(() => {
  var main = document.querySelector('main');
  var cards = Array.prototype.slice.call(main.querySelectorAll('ul > li')).map(function (e) {
    var r = e.getBoundingClientRect();
    return { h: Math.round(r.height), hasDigit: /\\d/.test(e.textContent || ''), txt: (e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90) };
  });
  var sizes = {};
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function (e) {
    if (e.children.length || !(e.textContent || '').trim()) return;
    var r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return;
    var s = String(Math.round(parseFloat(getComputedStyle(e).fontSize)));
    sizes[s] = (sizes[s] || 0) + 1;
  });
  var switches = Array.prototype.slice.call(main.querySelectorAll('[role="switch"]')).map(function (e) {
    var r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  return { cards: cards.slice(0, 8), cardCount: cards.length, sizes: sizes, switches: switches,
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
})()`;

const ROUTES: Array<[string, string]> = [
  ['kritik-stok', '/satin-alma/kritik-stok'],
  ['onay-kuyrugu', '/satin-alma/onay-kuyrugu'],
  ['siparisler', '/satin-alma/siparisler'],
  ['po-detay', `/satin-alma/siparisler/${PO}`],
  ['yeni', '/satin-alma/siparisler/yeni'],
  ['tedarikciler', '/satin-alma/tedarikciler'],
];

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, any> = {};
  for (const [key, route] of ROUTES) {
    out[key] = {};
    const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p1 = await c1.newPage();
    await openRoute(p1, { base, route, as: 'admin' });
    out[key].desktop = await p1.evaluate(DESKTOP_SRC);
    await c1.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const p2 = await c2.newPage();
    await openRoute(p2, { base, route, as: 'admin' });
    out[key].mobile = await p2.evaluate(MOBILE_SRC);
    await c2.close();
    console.error(`ok ${key}`);
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r6.json', JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
