import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const b=await launchBrowser(); const out:Record<string,unknown>={};
  const R:Array<[string,string]>=[['siparisler','/satin-alma/siparisler'],['kritik-stok','/satin-alma/kritik-stok'],['tedarikciler','/satin-alma/tedarikciler'],['po-detay','/satin-alma/siparisler/'+process.env.PO_ID],['yeni','/satin-alma/siparisler/yeni']];
  for(const [k,route] of R){
    const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR'});
    const p=await c.newPage(); await openRoute(p,{base,route,as:'admin'});
    await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await p.waitForTimeout(400);
    out[k]=await p.evaluate(()=>{
      const navs=Array.from(document.querySelectorAll('nav,[data-slot="mobile-nav"],footer')).filter(n=>{const cs=getComputedStyle(n);return cs.position==='fixed'&&n.getBoundingClientRect().height>0;});
      const nav=navs.map(n=>{const r=n.getBoundingClientRect();return {top:Math.round(r.top),h:Math.round(r.height),cls:(n.className||'').toString().slice(0,50)};});
      const navTop = nav.length?Math.min(...nav.map(n=>n.top)):null;
      const main=document.querySelector('main')!;
      const mb=main.getBoundingClientRect();
      const items=Array.from(main.querySelectorAll('ul > li, tbody tr, [data-slot="card"]')) as HTMLElement[];
      const last=items[items.length-1];
      const lr=last?last.getBoundingClientRect():null;
      const cs=getComputedStyle(main);
      const bodyPad=getComputedStyle(main.parentElement as HTMLElement).paddingBottom;
      return {navTop, nav, mainBottom:Math.round(mb.bottom), lastBottom: lr?Math.round(lr.bottom):null, lastTxt:last?(last.textContent||'').replace(/\s+/g,' ').trim().slice(0,40):null,
        occluded: (navTop!=null&&lr)? Math.round(lr.bottom-navTop):null, mainPadBottom:cs.paddingBottom, parentPadBottom:bodyPad, vh:window.innerHeight};
    });
    await c.close();
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r8e.json',JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
