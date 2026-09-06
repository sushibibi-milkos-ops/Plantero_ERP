import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const b = await launchBrowser();
  const c = await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
  const p = await c.newPage();
  const reqs:any[] = [];
  const msgs:string[] = [];
  p.on('response',(r)=>{ if(r.status()>=400) reqs.push({url:r.url().slice(0,160),status:r.status()}); });
  p.on('console',(m)=>{ if(m.type()==='error') msgs.push(m.text().slice(0,220)); });
  await openRoute(p,{base,route:'/satin-alma/kritik-stok',as:'admin'});
  await p.waitForTimeout(2000);
  writeFileSync('artifacts/critic/probe-tedarik-r9b.json', JSON.stringify({failedRequests:reqs, console:msgs},null,1));
  console.error(JSON.stringify({failedRequests:reqs, console:msgs},null,1));
  await b.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
