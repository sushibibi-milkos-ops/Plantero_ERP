import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = process.env.PO_ID!;
const SRC = `(() => {
  var main = document.querySelector('main');
  var out = { cells: [], overflowNodes: [], fonts: {}, aboveFold: 0, rowH: [], primaryEls: [], chainTops: [], iconCount: 0, colorTones: [] };
  // --- tablo sutun kilidi ---
  var table = main.querySelector('table');
  if (table) {
    var heads = Array.prototype.slice.call(table.querySelectorAll('thead th'));
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    for (var i=0;i<heads.length;i++){
      var clipped=0, maxClip=0, innerW=0, sample='';
      for (var j=0;j<rows.length;j++){
        var td = rows[j].children[i]; if(!td) continue;
        var cands=[td].concat(Array.prototype.slice.call(td.querySelectorAll('*')));
        for(var k=0;k<cands.length;k++){
          var c=cands[k];
          if(c.scrollWidth > c.clientWidth+1){ clipped++; maxClip=Math.max(maxClip,c.scrollWidth-c.clientWidth); innerW=Math.round(c.getBoundingClientRect().width); if(!sample) sample=(c.textContent||'').trim().slice(0,40); break; }
        }
      }
      // en genis ic kutu genisligi (kirpma olmasa da olcelim)
      var maxInner = 0;
      for (var j2=0;j2<rows.length;j2++){
        var td2 = rows[j2].children[i]; if(!td2) continue;
        var kids = Array.prototype.slice.call(td2.querySelectorAll('*'));
        for (var k2=0;k2<kids.length;k2++){ var w=kids[k2].getBoundingClientRect().width; if(w>maxInner) maxInner=w; }
      }
      out.cells.push({i:i, head:(heads[i].textContent||'').trim(), thW: Math.round(heads[i].getBoundingClientRect().width), clipped:clipped, rows:rows.length, maxClip:maxClip, innerW:innerW, maxInner:Math.round(maxInner), sample:sample});
    }
    var trs = rows.slice(0,5).map(function(r){return Math.round(r.getBoundingClientRect().height*10)/10;});
    out.rowH = trs;
    // ilk ekranda gorunen satir sayisi (viewport yuksekligi icinde)
    var vh = window.innerHeight;
    out.aboveFold = rows.filter(function(r){ var b=r.getBoundingClientRect(); return b.top < vh && b.bottom > 0; }).length;
    var th0 = table.querySelector('thead');
    out.theadTop = th0 ? Math.round(th0.getBoundingClientRect().top + window.scrollY) : null;
  }
  // --- yatay tasma ---
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    if(el.scrollWidth > el.clientWidth+1){
      var cs=getComputedStyle(el);
      if(cs.overflowX==='auto'||cs.overflowX==='scroll'){
        out.overflowNodes.push({cls:(el.className||'').toString().slice(0,60), sw:el.scrollWidth, cw:el.clientWidth, over:el.scrollWidth-el.clientWidth});
      }
    }
  });
  // --- main icindeki gorunur font boyutlari ---
  function vis(el){ var cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') return false; var r=el.getBoundingClientRect(); return r.width>0&&r.height>0; }
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    var hasText = Array.prototype.some.call(el.childNodes, function(n){return n.nodeType===3 && (n.textContent||'').trim().length>0;});
    if(!hasText || !vis(el)) return;
    var fs = Math.round(parseFloat(getComputedStyle(el).fontSize));
    out.fonts[fs] = (out.fonts[fs]||0)+1;
  });
  // --- primary token tasiyan gorunur elemanlar ---
  var primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    if(!vis(el)) return;
    var cs=getComputedStyle(el);
    var c=cs.color, bg=cs.backgroundColor;
    var isP = false;
    // yaklasik: yesil tonlu (g > r ve g > b belirgin)
    function greenish(s){ var m=/rgba?\\(([^)]+)\\)/.exec(s); if(!m) return false; var p=m[1].split(',').map(parseFloat); if(p.length>3&&p[3]<0.1) return false; return p[1]>p[0]+18 && p[1]>p[2]+18; }
    if(greenish(c)||greenish(bg)) { out.primaryEls.push({tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,50), txt:(el.textContent||'').trim().slice(0,28), color:c, bg:bg}); }
  });
  // --- belge zinciri docNo top ---
  var chain = main.querySelector('[data-slot="document-chain"], .document-chain');
  var chainLinks = chain ? Array.prototype.slice.call(chain.querySelectorAll('a')) : [];
  if(!chainLinks.length){
    // fallback: kartlarda .code sinifli docNo
    chainLinks = Array.prototype.slice.call(main.querySelectorAll('a')).filter(function(a){return a.querySelector('.code');});
  }
  out.chainTops = chainLinks.map(function(a){ var d=a.querySelector('.code'); return {docNo:d?(d.textContent||'').trim():null, top: d?Math.round(d.getBoundingClientRect().top):null, aTop:Math.round(a.getBoundingClientRect().top)}; });
  // --- ikon sayisi ---
  out.iconCount = main.querySelectorAll('svg').length;
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
    await p.waitForTimeout(1500);
    const data = await p.evaluate(SRC) as Record<string, unknown>;
    data.console = msgs;
    out[k] = data;
    await c.close();
    console.error('ok '+k);
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r8.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
