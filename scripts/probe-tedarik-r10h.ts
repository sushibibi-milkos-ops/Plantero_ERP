import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const browser = await launchBrowser();
  const c = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'tr-TR' });
  const p = await c.newPage();
  await openRoute(p,{base,route:'/satin-alma/kritik-stok',as:'admin'});
  await p.waitForTimeout(1200);
  const out = await p.evaluate(()=>{
    const res:any = { interactive:[], scrollers:[] };
    document.querySelectorAll('main button, main a, main input, main [role="checkbox"], main [role="switch"]').forEach((el)=>{
      const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return;
      const r=el.getBoundingClientRect(); if(r.width<=0||r.height<=0) return;
      res.interactive.push({ tag:el.tagName.toLowerCase(), role:el.getAttribute('role')||'', id:el.id||'', txt:(el.textContent||'').trim().slice(0,24), w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10 });
    });
    document.querySelectorAll('main *').forEach((el)=>{
      const cs=getComputedStyle(el);
      if((cs.overflowX==='auto'||cs.overflowX==='scroll') && el.scrollWidth>el.clientWidth+1)
        res.scrollers.push({ cls:(el.className||'').toString().slice(0,70), sw:el.scrollWidth, cw:el.clientWidth });
    });
    return res;
  });
  writeFileSync('artifacts/critic/probe-tedarik-r10h.json', JSON.stringify(out,null,1));
  console.error(JSON.stringify(out.interactive.filter((x:any)=>x.w<44||x.h<44),null,1));
  console.error('scrollers: '+JSON.stringify(out.scrollers));
  console.error('checkbox: '+JSON.stringify(out.interactive.filter((x:any)=>x.id==='only-critical'||x.role==='checkbox')));
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
