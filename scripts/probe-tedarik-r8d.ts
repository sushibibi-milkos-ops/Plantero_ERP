import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const SRC = `(() => {
  var main=document.querySelector('main');
  var out={blocks:[],odd:[]};
  // main'in dogrudan cocuklarinin dikey yerlesimi
  function walk(el, depth){
    Array.prototype.slice.call(el.children).forEach(function(c){
      var r=c.getBoundingClientRect();
      if(r.height<1) return;
      if(depth<=1) out.blocks.push({d:depth, tag:c.tagName.toLowerCase(), cls:(c.className||'').toString().slice(0,70), top:Math.round(r.top), h:Math.round(r.height), txt:(c.textContent||'').replace(/\\s+/g,' ').trim().slice(0,45)});
      if(depth<1) walk(c, depth+1);
    });
  }
  walk(main,0);
  // 19px / alisilmadik font boyutlari
  Array.prototype.slice.call(main.querySelectorAll('*')).forEach(function(el){
    var hasText=Array.prototype.some.call(el.childNodes,function(n){return n.nodeType===3&&(n.textContent||'').trim().length>0;});
    if(!hasText) return;
    var cs=getComputedStyle(el); if(cs.display==='none') return;
    var fs=Math.round(parseFloat(cs.fontSize));
    if(fs!==12&&fs!==13&&fs!==11&&fs!==24&&fs!==14) out.odd.push({fs:fs, tag:el.tagName.toLowerCase(), cls:(el.className||'').toString().slice(0,70), txt:(el.textContent||'').trim().slice(0,30), weight:cs.fontWeight});
  });
  return out;
})()`;
async function main(){
  const b=await launchBrowser(); const out:Record<string,unknown>={};
  for(const [k,route] of [['kritik-stok','/satin-alma/kritik-stok'],['siparisler','/satin-alma/siparisler']] as Array<[string,string]>){
    const c=await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
    const p=await c.newPage(); await openRoute(p,{base,route,as:'admin'});
    out[k]=await p.evaluate(SRC); await c.close();
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r8d.json',JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
