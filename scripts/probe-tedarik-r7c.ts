import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const SRC = `(() => {
  var main=document.querySelector('main');
  var rows=Array.prototype.slice.call(main.querySelectorAll('table tbody tr'));
  return rows.map(function(tr){
    var td=tr.children[5]; if(!td) return null;
    var inner=td.querySelector('*')||td;
    return { txt:(td.textContent||'').trim(), tdW:Math.round(td.getBoundingClientRect().width), innerW:Math.round(inner.getBoundingClientRect().width), sw:inner.scrollWidth, cw:inner.clientWidth, to:getComputedStyle(inner).textOverflow, ov:getComputedStyle(inner).overflow, cls:(inner.className||'').toString().slice(0,60) };
  });
})()`;
async function main(){
  const b=await launchBrowser();
  const c=await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
  const p=await c.newPage();
  await openRoute(p,{base,route:'/satin-alma/kritik-stok',as:'admin'});
  const out=await p.evaluate(SRC);
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r7c.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
