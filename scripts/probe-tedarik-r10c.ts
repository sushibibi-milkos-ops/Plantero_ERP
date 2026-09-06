import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const ROUTES: Array<[string,string]> = [
  ['yeni','/satin-alma/siparisler/yeni'],
  ['onay-kuyrugu','/satin-alma/onay-kuyrugu'],
  ['kritik-stok','/satin-alma/kritik-stok'],
];
async function main(){
  const browser = await launchBrowser();
  const out: any = {};
  for(const [k,route] of ROUTES){
    const c = await browser.newContext({ viewport:{width:1440,height:900}, locale:'tr-TR' });
    const p = await c.newPage();
    await openRoute(p,{base,route,as:'admin'});
    await p.waitForTimeout(1000);
    const stops:any[] = [];
    const seen = new Set<string>();
    for(let i=0;i<60;i++){
      await p.keyboard.press('Tab'); await p.waitForTimeout(220);
      const info = await p.evaluate(()=>{ const a=document.activeElement as HTMLElement|null; if(!a||a===document.body) return null;
        const inMain = !!a.closest('main'); if(!inMain) return null;
        const cs=getComputedStyle(a);
        return { tag:a.tagName.toLowerCase(), txt:(a.textContent||'').trim().slice(0,26), aria:a.getAttribute('aria-label')||'', outline:cs.outline, ring:cs.boxShadow }; });
      if(info){ const key=info.tag+'|'+info.txt+'|'+info.aria; if(!seen.has(key)){ seen.add(key); stops.push(info); } }
    }
    out[k]=stops;
    await c.close();
    console.error('ok '+k+' stops='+stops.length);
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r10g.json', JSON.stringify(out,null,1));
  console.error(JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
