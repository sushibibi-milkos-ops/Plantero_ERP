import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = '8c8ef372-f51e-4499-9a61-b589ac36af47';
const ROUTES: Array<[string,string]> = [
  ['kritik-stok','/satin-alma/kritik-stok'],['onay-kuyrugu','/satin-alma/onay-kuyrugu'],
  ['siparisler','/satin-alma/siparisler'],['po-detay',`/satin-alma/siparisler/${PO}`],
  ['yeni','/satin-alma/siparisler/yeni'],['tedarikciler','/satin-alma/tedarikciler'],
];
async function main(){
  const browser = await launchBrowser();
  const out:any = {};
  for(const vp of [{w:1440,h:900,name:'desktop'},{w:390,h:844,name:'mobile'}]){
    for(const [k,route] of ROUTES){
      const c = await browser.newContext({ viewport:{width:vp.w,height:vp.h}, isMobile:vp.w<500, hasTouch:vp.w<500, locale:'tr-TR' });
      const p = await c.newPage();
      const errs:string[]=[]; const bad:string[]=[];
      p.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,140)); });
      p.on('response', r=>{ if(r.status()>=400) bad.push(r.status()+' '+r.url().slice(0,90)); });
      await openRoute(p,{base,route,as:'admin'});
      await p.waitForTimeout(700);
      const d = await p.evaluate(()=>{
        // yatay kaydırılabilir raylar (KPI şeridi vb.) ve gerçek kırpma
        const rails:any[]=[];
        document.querySelectorAll('main *').forEach(el=>{ const e=el as HTMLElement;
          if(e.scrollWidth > e.clientWidth+2 && e.clientWidth>200){
            const cs=getComputedStyle(e);
            if(cs.overflowX==='auto'||cs.overflowX==='scroll') rails.push({cls:e.className.toString().slice(0,60), sw:e.scrollWidth, cw:e.clientWidth});
          }});
        // etkileşimli eleman boyutları
        const small:any[]=[];
        document.querySelectorAll('main a,main button,main input,main [role="switch"],main [role="checkbox"]').forEach(el=>{
          const e=el as HTMLElement; const r=e.getBoundingClientRect();
          if(r.width===0||r.height===0) return;
          if(r.width<44||r.height<44) small.push({t:(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,24), w:Math.round(r.width), h:Math.round(r.height)});
        });
        return { rails, small };
      });
      out[vp.name+':'+k] = { consoleErrors: errs.length, errs: errs.slice(0,4), bad: bad.slice(0,4), ...d };
      await c.close();
    }
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r11c.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
