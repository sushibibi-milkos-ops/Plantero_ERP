/** gorsel-critic tur 11 — kalite tablolarında sütun genişliği vs. gerçek metin genişliği (Range ile). */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const SRC = `(() => {
  var main = document.querySelector('main');
  var out = { cells: [], tableW: null };
  var table = main.querySelector('table');
  if (!table) return out;
  out.tableW = Math.round(table.getBoundingClientRect().width);
  var heads = Array.prototype.slice.call(table.querySelectorAll('thead th'));
  var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
  var textW = function (el) {
    var max = 0;
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n, total = 0;
    while ((n = walk.nextNode())) {
      if (!String(n.nodeValue || '').trim()) continue;
      var rg = document.createRange(); rg.selectNodeContents(n);
      var r = rg.getBoundingClientRect();
      if (r.width > max) max = r.width;
      total += r.width;
    }
    return Math.round(Math.max(max, Math.min(total, el.getBoundingClientRect().width * 3)));
  };
  for (var i = 0; i < heads.length; i++) {
    var maxContent = 0, sample = '';
    for (var j = 0; j < rows.length; j++) {
      var td = rows[j].children[i]; if (!td) continue;
      var w = textW(td);
      if (w > maxContent) { maxContent = w; sample = String(td.textContent || '').trim().slice(0, 46); }
    }
    var thW = Math.round(heads[i].getBoundingClientRect().width);
    out.cells.push({ head: String(heads[i].textContent || '').trim(), width: thW, maxContent: maxContent, slack: thW - maxContent, sample: sample });
  }
  return out;
})()`;

const ROUTES: Array<[string, string]> = [
  ['kontroller', '/kalite/kontroller'],
  ['sablonlar', '/kalite/sablonlar'],
  ['tedarikci-skoru', '/kalite/tedarikci-skoru'],
  ['geri-cagirma', '/kalite/geri-cagirma'],
];

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [k, route] of ROUTES) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await c.newPage();
    await openRoute(p, { base, route, as: 'admin' });
    await p.waitForTimeout(1000);
    out[k] = await p.evaluate(SRC);
    await c.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-kalite-r11/colwidth.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
