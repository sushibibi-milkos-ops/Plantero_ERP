import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const b = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [k,route] of [['yeni','/satin-alma/siparisler/yeni'],['onay','/satin-alma/onay-kuyrugu']] as Array<[string,string]>) {
    const c = await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
    const p = await c.newPage();
    await openRoute(p,{base,route,as:'admin'});
    await p.locator('main').first().click({position:{x:5,y:5}}).catch(()=>{});
    const seen:any[] = [];
    for (let i=0;i<28;i++){
      await p.keyboard.press('Tab');
      const info = await p.evaluate(()=>{
        const el = document.activeElement as HTMLElement | null;
        if(!el) return null;
        const inMain = !!el.closest('main');
        const cs = getComputedStyle(el);
        const matchesFV = el.matches(':focus-visible');
        return { inMain, tag: el.tagName.toLowerCase(), txt:(el.textContent||'').trim().slice(0,22), bs: cs.boxShadow.slice(0,90), outline: cs.outlineWidth+' '+cs.outlineStyle, fv: matchesFV, ring: cs.getPropertyValue('--tw-ring-shadow')||'' };
      });
      if(info && info.inMain) seen.push(info);
    }
    out[k] = seen;
    await c.close();
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r8c.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
