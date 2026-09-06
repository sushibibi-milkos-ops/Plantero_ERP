import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = process.env.PO_ID!;
const SRC = `(() => {
  var main = document.querySelector('main');
  var out = { cells: [], overflowNodes: [], fonts: {}, aboveFold: 0, rowH: [], theadTop: null, iconCount: 0, tabularCells: [], zeroDim: [], greenEls: [] };
  function vis(el){ var cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') return false; var r=el.getBoundingClientRect(); return r.width>0&&r.height>0; }
  var table = main.querySelector('table');
  if (table) {
    var heads = Array.prototype.slice.call(table.querySelectorAll('thead th'));
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    for (var i=0;i<heads.length;i++){
      var clipped=0,maxClip=0,maxInner=0,sample='';
      for (var j=0;j<rows.length;j++){
        var td = rows[j].children[i]; if(!td) continue;
        var cands=[td].concat(Array.prototype.slice.call(td.querySelectorAll('*')));
        for(var k=0;k<cands.length;k++){ var c=cands[k];
          if(c.scrollWidth > c.clientWidth+1){ clipped++; maxClip=Math.max(maxClip,c.scrollWidth-c.clientWidth); if(!sample) sample=(c.textContent||'').trim().slice(0,40); break; } }
        var kids = Array.prototype.slice.call(td.querySelectorAll('*'));
        for (var k2=0;k2<kids.length;k2++){ var w=kids[k2].getBoundingClientRect().width; if(w>maxInner) maxInner=w; }
      }
      out.cells.push({i:i, head:(heads[i].textContent||'').trim(), thW:Math.round(heads[i].getBoundingClientRect().width), clipped:clipped, rows:rows.length, maxClip:maxClip, maxInner:Math.round(maxInner), sample:sample, align:getComputedStyle(heads[i]).textAlign});
    }
    out.rowH = rows.slice(0,5).map(function(r){return Math.round(r.getBoundingClientRect().height*10)/10;});
    var vh = window.innerHeight;
    out.aboveFold = rows.filter(function(r){ var b=r.getBoundingClientRect(); return b.top < vh && b.bottom > 0; }).length;
    var th0 = table.querySelector('thead');
    out.theadTop = th0 ? Math.round(th0.getBoundingClientRect().top + window.scrollY) : null;
    // sayisal hucrelerde tabular-nums
    var numRe = /^[₺%\\s]*[0-9][0-9.,\\s]*(₺|%|kg|g|adet|gün|lt)?$/i;
    var tds = Array.prototype.slice.call(table.querySelectorAll('tbody tr td'));
    tds.forEach(function(td){
      var t=(td.textContent||'').trim();
      if(!t || !numRe.test(t)) return;
      var el = td.querySelector('*') || td;
      var cs = getComputedStyle(el), cstd = getComputedStyle(td);
      var fv = (cs.fontVariantNumeric||'') + ' ' + (cstd.fontVariantNumeric||'');
      out.tabularCells.push({txt:t.slice(0,18), tabular: fv.indexOf('tabular-nums')>=0, align: cstd.textAlign});
    });
  }
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    if(el.scrollWidth > el.clientWidth+1){ var cs=getComputedStyle(el);
      if(cs.overflowX==='auto'||cs.overflowX==='scroll'){ out.overflowNodes.push({cls:(el.className||'').toString().slice(0,60), sw:el.scrollWidth, cw:el.clientWidth, over:el.scrollWidth-el.clientWidth}); } }
  });
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    var hasText = Array.prototype.some.call(el.childNodes, function(n){return n.nodeType===3 && (n.textContent||'').trim().length>0;});
    if(!hasText || !vis(el)) return;
    var fs = Math.round(parseFloat(getComputedStyle(el).fontSize));
    out.fonts[fs] = (out.fonts[fs]||0)+1;
  });
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    if(!vis(el)) return; var cs=getComputedStyle(el);
    function greenish(s){ var m=/rgba?\\(([^)]+)\\)/.exec(s); if(!m) return false; var p=m[1].split(',').map(parseFloat); if(p.length>3&&p[3]<0.1) return false; return p[1]>p[0]+18 && p[1]>p[2]+18; }
    if(greenish(cs.color)||greenish(cs.backgroundColor)) out.greenEls.push({tag:el.tagName.toLowerCase(), txt:(el.textContent||'').trim().slice(0,30), color:cs.color, bg:cs.backgroundColor});
  });
  out.iconCount = main.querySelectorAll('svg').length;
  var svgs = Array.prototype.slice.call(main.querySelectorAll('svg'));
  out.iconSizes = {};
  svgs.forEach(function(s){ if(!vis(s)) return; var r=s.getBoundingClientRect(); var key=Math.round(r.width)+'x'+Math.round(r.height); out.iconSizes[key]=(out.iconSizes[key]||0)+1; });
  return out;
})()`;
const ROUTES: Array<[string,string]> = [
  ['kritik-stok','/satin-alma/kritik-stok'],
  ['onay-kuyrugu','/satin-alma/onay-kuyrugu'],
  ['siparisler','/satin-alma/siparisler'],
  ['po-detay',`/satin-alma/siparisler/${PO}`],
  ['yeni','/satin-alma/siparisler/yeni'],
  ['tedarikciler','/satin-alma/tedarikciler'],
];
async function main(){
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for(const [k,route] of ROUTES){
    const c = await browser.newContext({ viewport:{width:1440,height:900}, locale:'tr-TR' });
    const p = await c.newPage();
    const msgs:string[]=[];
    p.on('console',(m)=>{ if(m.type()==='error') msgs.push('error: '+m.text().slice(0,200)); });
    p.on('pageerror',(e)=>msgs.push('pageerror: '+String(e).slice(0,200)));
    await openRoute(p,{base,route,as:'admin'});
    await p.waitForTimeout(1200);
    const data = await p.evaluate(SRC) as Record<string, unknown>;
    data.console = msgs;
    // satir hover
    const row = p.locator('tbody tr').first();
    if(await row.count()){
      const before = await row.evaluate((el)=>getComputedStyle(el).backgroundColor);
      await row.hover().catch(()=>{});
      await p.waitForTimeout(250);
      const after = await row.evaluate((el)=>getComputedStyle(el).backgroundColor);
      const cur = await row.evaluate((el)=>getComputedStyle(el).cursor);
      (data as any).hover = { before, after, cursor: cur, changed: before!==after };
    }
    // focus ring turu
    const stops:any[] = [];
    for(let i=0;i<10;i++){
      await p.keyboard.press('Tab');
      const info = await p.evaluate(()=>{ const a=document.activeElement as HTMLElement|null; if(!a) return null;
        const inMain = !!a.closest('main'); const cs=getComputedStyle(a);
        return { tag:a.tagName.toLowerCase(), txt:(a.textContent||'').trim().slice(0,24), inMain, outline:cs.outline, ring:cs.boxShadow.slice(0,60) }; });
      if(info) stops.push(info);
    }
    (data as any).tabStops = stops.filter((s)=>s.inMain);
    out[k] = data;
    await c.close();
    console.error('ok '+k);
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r10.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
