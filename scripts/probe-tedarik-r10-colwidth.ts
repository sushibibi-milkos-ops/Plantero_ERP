import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const SRC = `(() => {
  var main = document.querySelector('main');
  var out = { cells: [], scroller: null };
  var table = main.querySelector('table');
  if (table) {
    var heads = Array.prototype.slice.call(table.querySelectorAll('thead th'));
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    for (var i=0;i<heads.length;i++){
      var clipped=0, maxClip=0, maxInner=0, sample='';
      for (var j=0;j<rows.length;j++){
        var td = rows[j].children[i]; if(!td) continue;
        var cands=[td].concat(Array.prototype.slice.call(td.querySelectorAll('*')));
        for(var k=0;k<cands.length;k++){
          var c=cands[k];
          if(c.scrollWidth > c.clientWidth+1){ clipped++; maxClip=Math.max(maxClip,c.scrollWidth-c.clientWidth); if(!sample) sample=(c.textContent||'').trim().slice(0,50); break; }
        }
        var kids = Array.prototype.slice.call(td.querySelectorAll('*'));
        for (var k2=0;k2<kids.length;k2++){ var w=kids[k2].getBoundingClientRect().width; if(w>maxInner) maxInner=w; }
      }
      out.cells.push({i:i, head:(heads[i].textContent||'').trim(), thW: Math.round(heads[i].getBoundingClientRect().width), clipped:clipped, rows:rows.length, maxClip:maxClip, maxInner:Math.round(maxInner), sample:sample});
    }
  }
  var scroller = main.querySelector('.overflow-auto');
  if (scroller) out.scroller = { sw: scroller.scrollWidth, cw: scroller.clientWidth, over: scroller.scrollWidth - scroller.clientWidth };
  return out;
})()`;

const ROUTES: Array<[string, string]> = [
  ['kritik-stok', '/satin-alma/kritik-stok'],
  ['siparisler', '/satin-alma/siparisler'],
  ['tedarikciler', '/satin-alma/tedarikciler'],
];

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [k, route] of ROUTES) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await c.newPage();
    await openRoute(p, { base, route, as: 'satin_alma' });
    await p.waitForTimeout(1200);
    out[k] = await p.evaluate(SRC);
    await c.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r10-colwidth.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main();
