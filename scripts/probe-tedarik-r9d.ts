import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const b = await launchBrowser();
  const c = await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
  const p = await c.newPage();
  const all:any[] = [];
  c.on('response',(r)=>{ if(r.status()>=400) all.push({url:r.url().slice(0,200),status:r.status(),frame:r.frame()?.url().slice(0,60)}); });
  c.on('requestfailed',(r)=>{ all.push({url:r.url().slice(0,200),failed:r.failure()?.errorText}); });
  await openRoute(p,{base,route:'/satin-alma/kritik-stok',as:'admin'});
  await p.waitForTimeout(2500);
  writeFileSync('artifacts/critic/probe-tedarik-r9d.json', JSON.stringify(all,null,1));
  console.error(JSON.stringify(all,null,1));
  await b.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
