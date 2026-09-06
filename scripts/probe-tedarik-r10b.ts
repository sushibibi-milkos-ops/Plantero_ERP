import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const browser = await launchBrowser();
  const out: any = {};
  for (const [k, route] of [['kritik-stok','/satin-alma/kritik-stok']] as Array<[string,string]>) {
    const c = await browser.newContext({ viewport:{width:1440,height:900}, locale:'tr-TR' });
    const p = await c.newPage();
    const fails:any[] = [];
    p.on('response',(r)=>{ if(r.status()>=400) fails.push({url:r.url(), status:r.status()}); });
    p.on('requestfailed',(r)=>fails.push({url:r.url(), failure:r.failure()?.errorText}));
    await openRoute(p,{base,route,as:'admin'});
    await p.waitForTimeout(2000);
    out[k] = fails;
    await c.close();
  }
  // mobil dokunma hedefi: Motoru calistir
  const c2 = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'tr-TR' });
  const p2 = await c2.newPage();
  await openRoute(p2,{base,route:'/satin-alma/kritik-stok',as:'admin'});
  await p2.waitForTimeout(1200);
  out.mobileTargets = await p2.evaluate(()=>{
    const els = Array.from(document.querySelectorAll('main button, main a, main input, main [role="switch"], main [role="button"]'));
    return els.filter((el)=>{ const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0&&(r.width<44||r.height<44); })
      .map((el)=>{ const r=el.getBoundingClientRect(); return { tag:el.tagName.toLowerCase(), txt:(el.textContent||'').trim().slice(0,28), w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10 }; });
  });
  await c2.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r10b.json', JSON.stringify(out,null,1));
  console.error(JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
