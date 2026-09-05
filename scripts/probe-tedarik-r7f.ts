import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const b=await launchBrowser();
  const c=await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
  const p=await c.newPage();
  const msgs:string[]=[];
  p.on('console',(m)=>{ if(m.type()==='error') msgs.push(m.text().slice(0,200)); });
  await openRoute(p,{base,route:'/satin-alma/kritik-stok',as:'admin'});
  const btns = await p.$$('main button');
  let opened=false;
  for(const btn of btns){
    const al = await btn.getAttribute('aria-label');
    const t = (await btn.textContent())||'';
    if((al&&/sütun|kolon|column/i.test(al)) || /sütun/i.test(t)){ await btn.click(); opened=true; break; }
  }
  if(!opened){ // last toolbar button
    const b2 = btns[btns.length-1]; if(b2) { await b2.click(); opened=true; }
  }
  await p.waitForTimeout(600);
  const items = await p.$$eval('[role="menuitemcheckbox"], [role="menuitem"], [role="option"]', els=>els.map(e=>({t:(e.textContent||'').trim(), checked:e.getAttribute('aria-checked')})));
  const dialogText = await p.$$eval('[role="menu"],[role="dialog"]', els=>els.map(e=>(e.textContent||'').replace(/\s+/g,' ').trim().slice(0,300)));
  writeFileSync('artifacts/critic/probe-tedarik-r7f.json', JSON.stringify({opened, items, dialogText, msgs},null,1));
  await b.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
