/** shell-datatable-slack-01 ölçümü: sütun TH genişliği − en geniş içerik = slack (1440x900). */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const SRC = `(() => {
  var table = document.querySelector('main table'); if (!table) return null;
  var heads = Array.prototype.slice.call(table.querySelectorAll('thead th'));
  var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr')).slice(0, 8);
  var out = { tableW: Math.round(table.getBoundingClientRect().width), cols: [] };
  for (var i = 0; i < heads.length; i++) {
    var maxContent = 0;
    for (var j = 0; j < rows.length; j++) {
      var td = rows[j].children[i]; if (!td) continue;
      var r = document.createRange(); r.selectNodeContents(td);
      var w = r.getBoundingClientRect().width; if (w > maxContent) maxContent = w;
    }
    var thW = heads[i].getBoundingClientRect().width;
    out.cols.push({ head: (heads[i].textContent || '').trim(), thW: Math.round(thW), content: Math.round(maxContent), slack: Math.round(thW - maxContent) });
  }
  return out;
})()`;

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const route of ['/satis/fiyat-listeleri', '/satis/kanallar']) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await c.newPage();
    await openRoute(p, { base, route, as: 'admin' });
    await p.waitForTimeout(1200);
    out[route] = await p.evaluate(SRC);
    await c.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-shell-r29-slack.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
}
main();
