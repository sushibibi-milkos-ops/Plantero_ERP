import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = process.env.PO_ID!;

const SRC = `(() => {
  var vis = function (el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  var main = document.querySelector('main');
  var all = Array.prototype.slice.call(main.querySelectorAll('*')).filter(vis);
  var bgs = {}, fills = [];
  all.forEach(function (el) {
    var cs = getComputedStyle(el);
    var bg = cs.backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return;
    bgs[bg] = (bgs[bg] || 0) + 1;
    var r = el.getBoundingClientRect();
    fills.push({ bg: bg, txt: (el.textContent || '').trim().slice(0, 22), w: Math.round(r.width), h: Math.round(r.height), tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 60) });
  });
  var borders = [];
  all.forEach(function (el) {
    var cs = getComputedStyle(el);
    if (parseFloat(cs.borderTopWidth) > 0) {
      borders.push({ c: cs.borderTopColor, w: cs.borderTopWidth, txt: (el.textContent || '').trim().slice(0, 22) });
    }
    if (cs.outlineWidth && parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') {
      borders.push({ outline: cs.outlineColor, w: cs.outlineWidth, txt: (el.textContent || '').trim().slice(0, 22) });
    }
  });
  var switches = Array.prototype.slice.call(main.querySelectorAll('[role="switch"]')).map(function (e) {
    var r = e.getBoundingClientRect();
    var inner = e.querySelector('*');
    return { w: Math.round(r.width), h: Math.round(r.height), state: e.getAttribute('data-state'),
      innerBg: inner ? getComputedStyle(inner).backgroundColor : null,
      selfBg: getComputedStyle(e).backgroundColor, aria: e.getAttribute('aria-label') };
  });
  var textColors = {};
  all.forEach(function (el) {
    if (el.children.length || !(el.textContent || '').trim()) return;
    var c = getComputedStyle(el).color;
    if (!textColors[c]) textColors[c] = [];
    if (textColors[c].length < 4) textColors[c].push((el.textContent || '').trim().slice(0, 16));
  });
  return { bgs: bgs, fills: fills.filter(function (f) { return f.w > 8 && f.h > 8; }).slice(0, 40),
    borders: borders.slice(0, 40), switches: switches, textColors: textColors };
})()`;

const ROUTES: Array<[string, string]> = [
  ['kritik-stok', '/satin-alma/kritik-stok'],
  ['onay-kuyrugu', '/satin-alma/onay-kuyrugu'],
  ['siparisler', '/satin-alma/siparisler'],
  ['po-detay', `/satin-alma/siparisler/${PO}`],
  ['tedarikciler', '/satin-alma/tedarikciler'],
];

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, any> = {};
  for (const [key, route] of ROUTES) {
    const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p1 = await c1.newPage();
    await openRoute(p1, { base, route, as: 'admin' });
    out[key] = { desktop: await p1.evaluate(SRC) };
    await c1.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const p2 = await c2.newPage();
    await openRoute(p2, { base, route, as: 'admin' });
    out[key].mobile = await p2.evaluate(SRC);
    await c2.close();
    console.error('ok ' + key);
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r6b.json', JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
