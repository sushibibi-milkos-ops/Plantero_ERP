// Tur 7 doğrulaması (shell-mobile-card-meta-gap-01 kapanışı): mobile-cards.tsx alt başlık
// kutusunun `flex-1` -> `shrink` düzeltmesinden SONRA kritik-stok'un TÜM (36/36) kartlarını ve
// regresyon kontrolü için siparisler/tedarikciler (uzun alt başlıklı) rotalarını ölçer.
// probe-tedarik-r7d.ts ile AYNI DOM sorgusu — yalnızca `slice(0,6)` kaldırıldı (tüm satırlar) ve
// kritik-stok'ta beklenen "gap<=8 && sepCount ilk ayraç yetim değil" özetini ekliyor.
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const SRC = `(() => {
  var main=document.querySelector('main');
  var lis=Array.prototype.slice.call(main.querySelectorAll('ul > li'));
  return lis.map(function(li){
    var row=li.querySelector('.mobile-card-subtitle-row');
    if(!row) return {no:'row'};
    var sub=row.firstElementChild, chain=row.children[1];
    var seps=Array.prototype.slice.call(row.querySelectorAll('span[aria-hidden]')).filter(function(s){return (s.textContent||'').trim()==='\\u00b7';});
    var subTextRight=null;
    if(sub){ var rg=document.createRange(); rg.selectNodeContents(sub); var rb=rg.getBoundingClientRect(); subTextRight=Math.round(rb.right); }
    var cr=chain?chain.getBoundingClientRect():null;
    return { h:Math.round(li.getBoundingClientRect().height),
      subTextRight:subTextRight,
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
    const rows = await p.evaluate(SRC) as Array<Record<string, unknown>>;
    out[k]=rows;
    if (k === 'kritik-stok') {
      const gaps = rows.map((r) => r.gap as number | null).filter((g): g is number => g != null);
      const maxGap = gaps.length ? Math.max(...gaps) : null;
      const orphanLeading = rows.filter((r) => r.subTextRight != null && r.chainLeft != null && (r.gap as number) > 8).length;
      out['kritik-stok-summary'] = { count: rows.length, maxGap, rowsWithGapOver8: orphanLeading };
    }
    await c.close(); console.error('ok '+k+' rows='+rows.length);
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r7g.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
