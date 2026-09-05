import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const SRC = `(() => {
  var main=document.querySelector('main');
  var lis=Array.prototype.slice.call(main.querySelectorAll('ul > li'));
  return lis.slice(0,6).map(function(li){
    var row=li.querySelector('.mobile-card-subtitle-row');
    if(!row) return {no:'row'};
    var sub=row.firstElementChild, chain=row.children[1];
    var seps=Array.prototype.slice.call(row.querySelectorAll('span[aria-hidden]')).filter(function(s){return (s.textContent||'').trim()==='\\u00b7';});
    var sr=sub?sub.getBoundingClientRect():null, cr=chain?chain.getBoundingClientRect():null;
    var subTxtEl=sub;
    var subTextRight=null;
    if(sub){ var rg=document.createRange(); rg.selectNodeContents(sub); var rb=rg.getBoundingClientRect(); subTextRight=Math.round(rb.right); }
    return { h:Math.round(li.getBoundingClientRect().height),
      subW: sr?Math.round(sr.width):null, subRight: sr?Math.round(sr.right):null, subTextRight:subTextRight,
      chainLeft: cr?Math.round(cr.left):null, chainW: cr?Math.round(cr.width):null,
      gap: (cr&&subTextRight!=null)?Math.round(cr.left-subTextRight):null,
      sepCount: seps.length,
      txt:(row.textContent||'').replace(/\\s+/g,' ').trim() };
  });
})()`;
const ROUTES: Array<[string,string]> = [['kritik-stok','/satin-alma/kritik-stok'],['tedarikciler','/satin-alma/tedarikciler'],['siparisler','/satin-alma/siparisler']];
async function main(){
  const b=await launchBrowser(); const out:Record<string,unknown>={};
  for(const [k,route] of ROUTES){
    const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR'});
    const p=await c.newPage(); await openRoute(p,{base,route,as:'admin'});
    out[k]=await p.evaluate(SRC); await c.close(); console.error('ok '+k);
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r7d.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
