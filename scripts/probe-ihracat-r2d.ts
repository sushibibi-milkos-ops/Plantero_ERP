import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const SHIP = '03241adc-54f8-480a-ba87-45d5f5fe2eb0';
async function main(){
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport:{width:1440,height:900}, locale:'tr-TR', timezoneId:'Europe/Istanbul' });
  const p = await ctx.newPage();
  await openRoute(p,{base:BASE, route:`/ihracat/sevkiyatlar/${SHIP}`, as:'admin'});
  const panel = await p.evaluate(`(() => {
    const els = Array.from(document.querySelectorAll('*')).filter(el => el.children.length===0 && /^(—|— \\/ —|0|0 kg)$/.test((el.textContent||'').trim()));
    return els.map(el => ({ t:(el.textContent||'').trim(), color:getComputedStyle(el).color, cls:(typeof el.className==='string'?el.className:'').slice(0,60), ctx:(el.closest('div,td')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40) }));
  })()`);
  await p.getByRole('tab',{name:'Çeki listesi'}).click();
  await p.waitForTimeout(500);
  const ceki = await p.evaluate(`(() => {
    const row = document.querySelector('tbody tr');
    if (!row) return null;
    return Array.from(row.children).map(td => ({ t:(td.textContent||'').trim(), color:getComputedStyle(td.firstElementChild||td).color, cls:(typeof td.className==='string'?td.className:'').slice(0,50) }));
  })()`);
  const muted = await p.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground')`);
  const fg = await p.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--foreground')`);
  await ctx.close(); await b.close();
  writeFileSync(resolve(process.cwd(),'artifacts/critic/probe-ihracat-r2d.json'), JSON.stringify({ panel, ceki, muted, fg },null,1));
  console.log(JSON.stringify({ ceki, muted, fg },null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
