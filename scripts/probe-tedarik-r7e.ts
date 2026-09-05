import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const ROUTES = ['/satin-alma/kritik-stok','/satin-alma/onay-kuyrugu','/satin-alma/siparisler','/satin-alma/tedarikciler','/satin-alma/siparisler/yeni'];
async function main(){
  const b=await launchBrowser(); const out:Record<string,string[]>={};
  for(const route of ROUTES){
    const c=await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
    const p=await c.newPage();
    const msgs:string[]=[];
    p.on('console',(m)=>{ if(m.type()==='error'||m.type()==='warning') msgs.push(m.type()+': '+m.text().slice(0,300)); });
    p.on('pageerror',(e)=>msgs.push('pageerror: '+String(e).slice(0,300)));
    await openRoute(p,{base,route,as:'admin'});
    await p.waitForTimeout(1200);
    out[route]=msgs; await c.close(); console.error('ok '+route);
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r7e.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
