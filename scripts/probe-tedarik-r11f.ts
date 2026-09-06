import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const browser = await launchBrowser();
  for(const vp of [{w:1440,h:900,n:'desktop'},{w:390,h:844,n:'mobile'}]){
    const c = await browser.newContext({viewport:{width:vp.w,height:vp.h},isMobile:vp.w<500,hasTouch:vp.w<500,locale:'tr-TR'});
    const p = await c.newPage();
    await openRoute(p,{base,route:'/satin-alma/tedarikciler',as:'admin'});
    await p.waitForTimeout(600);
    const r = await p.evaluate(()=>{
      const out:any[]=[];
      document.querySelectorAll('main *').forEach(el=>{const e=el as HTMLElement;
        if(e.children.length) return;
        const t=(e.textContent||'').trim();
        if(/^%(0|50|100)$/.test(t)) out.push({t, color:getComputedStyle(e).color, cls:e.className.toString().slice(0,50)});
      });
      return out;
    });
    console.error(vp.n+': '+JSON.stringify(r));
    await c.close();
  }
  await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
