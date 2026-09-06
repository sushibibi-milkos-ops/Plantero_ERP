import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = 'f69848da-f37e-4f87-bde2-b45a75c70da1';
const ROUTES: Array<[string,string]> = [
  ['kritik-stok','/satin-alma/kritik-stok'],
  ['siparisler','/satin-alma/siparisler'],
  ['po-detay',`/satin-alma/siparisler/${PO}`],
  ['tedarikciler','/satin-alma/tedarikciler'],
];
async function main(){
  const b = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [k,route] of ROUTES){
    const c = await b.newContext({viewport:{width:1440,height:900},locale:'tr-TR'});
    const p = await c.newPage();
    await openRoute(p,{base,route,as:'admin'});
    await p.waitForTimeout(800);
    const before = await p.evaluate(()=>{
      const tr = document.querySelector('main tbody tr') as HTMLElement|null;
      return tr ? getComputedStyle(tr).backgroundColor : null;
    });
    await p.hover('main tbody tr').catch(()=>{});
    await p.waitForTimeout(350);
    const data = await p.evaluate(()=>{
      const tr = document.querySelector('main tbody tr') as HTMLElement|null;
      const hoverBg = tr ? getComputedStyle(tr).backgroundColor : null;
      const cursor = tr ? getComputedStyle(tr).cursor : null;
      // tabular-nums: sayisal hucrelerdeki font-variant-numeric
      const nums: any[] = [];
      document.querySelectorAll('main tbody tr:first-child td').forEach((td)=>{
        const cs = getComputedStyle(td as Element);
        const txt=(td.textContent||'').trim().slice(0,20);
        if(/[0-9]/.test(txt)) nums.push({txt, fvn: cs.fontVariantNumeric, align: cs.textAlign});
      });
      // KPI rakamlari
      const kpis: any[] = [];
      document.querySelectorAll('main [data-slot="kpi-value"], main [class*="tabular"]').forEach((el)=>{
        const t=(el.textContent||'').trim().slice(0,20); if(t) kpis.push({t, fvn:getComputedStyle(el).fontVariantNumeric});
      });
      return {hoverBg, cursor, nums, kpis: kpis.slice(0,8)};
    });
    out[k] = {before, ...data};
    await c.close();
    console.error('ok '+k);
  }
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r9e.json', JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
