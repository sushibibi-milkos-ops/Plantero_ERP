import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const SHIP = '03241adc-54f8-480a-ba87-45d5f5fe2eb0';
const Q = `(() => {
  const lis = Array.from(document.querySelectorAll('li')).filter(li => li.offsetHeight>0 && /Proforma fatura/.test(li.textContent||''));
  const li = lis[0];
  if (!li) return { none: true };
  const btns = Array.from(li.querySelectorAll('button,a')).map(b => ({ t:(b.textContent||b.getAttribute('aria-label')||'').trim().slice(0,20), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
  return { h: Math.round(li.getBoundingClientRect().height*10)/10, html: li.innerHTML, btns };
})()`;
async function main(){
  const b = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [k, route, tab] of [['detay', `/ihracat/sevkiyatlar/${SHIP}`, 'Belgeler'], ['dash', '/ihracat/belgeler', '']] as const) {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'tr-TR', timezoneId:'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    if (tab) { await p.getByRole('tab', { name: tab }).click(); await p.waitForTimeout(400); }
    out[k] = await p.evaluate(Q);
    await ctx.close();
  }
  await b.close();
  writeFileSync(resolve(process.cwd(),'artifacts/critic/probe-ihracat-r2c.json'), JSON.stringify(out,null,1));
  console.log('ok');
}
main().catch(e=>{console.error(e);process.exit(1);});
