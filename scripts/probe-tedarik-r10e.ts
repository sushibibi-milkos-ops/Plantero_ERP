import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const browser = await launchBrowser();
  const c = await browser.newContext({ viewport:{width:1440,height:900}, locale:'tr-TR' });
  const p = await c.newPage();
  await openRoute(p,{base,route:'/satin-alma/onay-kuyrugu',as:'admin'});
  await p.waitForTimeout(1000);
  const out:any[] = [];
  for(let i=0;i<40;i++){
    await p.keyboard.press('Tab'); await p.waitForTimeout(260);
    const info = await p.evaluate(()=>{ const a=document.activeElement as HTMLElement|null; if(!a||a===document.body) return null;
      if(!a.closest('main')) return null;
      const cs=getComputedStyle(a);
      return { txt:(a.textContent||'').trim().slice(0,20), fv:a.matches(':focus-visible'), f:a.matches(':focus'), ring:cs.boxShadow, outline:cs.outline, cls:(a.className||'').toString().slice(0,120) }; });
    if(info) out.push(info);
  }
  // görsel kanıt: Onayla odaklıyken ekran görüntüsü
  await p.screenshot({ path:'artifacts/critic/focus-onayla-r10.png', clip:{x:360,y:440,width:800,height:110} });
  writeFileSync('artifacts/critic/probe-tedarik-r10f.json', JSON.stringify(out,null,1));
  console.error(JSON.stringify(out.map(o=>({t:o.txt,fv:o.fv,f:o.f,ring:o.ring.slice(-90),out:o.outline})),null,1));
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
