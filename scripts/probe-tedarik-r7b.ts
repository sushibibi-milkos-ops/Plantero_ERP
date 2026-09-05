import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = process.env.PO_ID!;
const SRC = `(() => {
  var main = document.querySelector('main');
  var table = main.querySelector('table');
  var out = { cells: [], theadW: [], overflowNodes: [] };
  if (table) {
    var heads = Array.prototype.slice.call(table.querySelectorAll('thead th'));
    out.theadW = heads.map(function(th){ return {h:(th.textContent||'').trim(), w: Math.round(th.getBoundingClientRect().width)}; });
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    for (var i=0;i<heads.length;i++){
      var clipped=0, maxClip=0, innerW=0, sample='';
      for (var j=0;j<rows.length;j++){
        var td = rows[j].children[i]; if(!td) continue;
        var cands=[td].concat(Array.prototype.slice.call(td.querySelectorAll('*')));
        for(var k=0;k<cands.length;k++){
          var c=cands[k];
          if(c.scrollWidth > c.clientWidth+1){ clipped++; maxClip=Math.max(maxClip,c.scrollWidth-c.clientWidth); innerW=Math.round(c.getBoundingClientRect().width); if(!sample) sample=(c.textContent||'').trim().slice(0,50); break; }
        }
      }
      out.cells.push({i:i, head:(heads[i].textContent||'').trim(), thW: Math.round(heads[i].getBoundingClientRect().width), clipped:clipped, rows:rows.length, maxClip:maxClip, innerW:innerW, sample:sample});
    }
  }
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    if(el.scrollWidth > el.clientWidth+1){
      var cs=getComputedStyle(el);
      if(cs.overflowX==='auto'||cs.overflowX==='scroll'){
        var r=el.getBoundingClientRect();
        out.overflowNodes.push({cls:(el.className||'').toString().slice(0,80), sw:el.scrollWidth, cw:el.clientWidth, over:el.scrollWidth-el.clientWidth, w:Math.round(r.width)});
      }
    }
  });
  return out;
})()`;
const ROUTES: Array<[string,string]> = [
  ['kritik-stok','/satin-alma/kritik-stok'],
  ['siparisler','/satin-alma/siparisler'],
  ['po-detay',`/satin-alma/siparisler/${PO}`],
  ['tedarikciler','/satin-alma/tedarikciler'],
];
async function main(){
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for(const [k,route] of ROUTES){
    const c = await browser.newContext({ viewport:{width:1440,height:900}, locale:'tr-TR' });
    const p = await c.newPage();
    await openRoute(p,{base,route,as:'admin'});
    out[k] = await p.evaluate(SRC);
    await c.close();
    console.error('ok '+k);
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r7b.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
