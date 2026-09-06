import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main(){
  const b = await launchBrowser();
  const out: Record<string, unknown> = {};
  // 1) /siparisler/yeni — focus ring + hover geri bildirimi
  {
    const c = await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
    const p = await c.newPage();
    await openRoute(p,{base,route:'/satin-alma/siparisler/yeni',as:'admin'});
    const res:any[] = [];
    const sels = ['button[role="combobox"]','input','button'];
    for (const s of sels) {
      const els = await p.locator(`main ${s}`).all();
      for (const el of els.slice(0,6)) {
        if (!(await el.isVisible())) continue;
        const before = await el.evaluate((n)=>{const cs=getComputedStyle(n);return {bs:cs.boxShadow,ol:cs.outlineWidth,bc:cs.borderColor,bg:cs.backgroundColor};});
        await el.focus().catch(()=>{});
        const focused = await el.evaluate((n)=>{const cs=getComputedStyle(n);return {bs:cs.boxShadow,ol:cs.outlineWidth,bc:cs.borderColor};});
        await el.hover().catch(()=>{});
        const hovered = await el.evaluate((n)=>{const cs=getComputedStyle(n);return {bg:cs.backgroundColor,bc:cs.borderColor};});
        res.push({sel:s, txt:(await el.textContent().catch(()=>''))?.trim().slice(0,22), ringChanged: before.bs!==focused.bs || before.bc!==focused.bc, hoverChanged: before.bg!==hovered.bg || before.bc!==hovered.bc, before, focused, hovered});
      }
    }
    out.yeniFocus = res;
    await c.close();
  }
  // 2) tablo satiri hover
  for (const [k,route] of [['siparisler','/satin-alma/siparisler'],['kritik-stok','/satin-alma/kritik-stok'],['tedarikciler','/satin-alma/tedarikciler']] as Array<[string,string]>) {
    const c = await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
    const p = await c.newPage();
    await openRoute(p,{base,route,as:'admin'});
    const row = p.locator('main tbody tr').nth(2);
    const before = await row.evaluate((n)=>getComputedStyle(n).backgroundColor);
    await row.hover();
    await p.waitForTimeout(250);
    const after = await row.evaluate((n)=>getComputedStyle(n).backgroundColor);
    const cursor = await row.evaluate((n)=>getComputedStyle(n).cursor);
    out['hover-'+k] = {before, after, changed: before!==after, cursor};
    await c.close();
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r8b.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
