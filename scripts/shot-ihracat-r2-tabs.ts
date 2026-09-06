import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const SHIP = '03241adc-54f8-480a-ba87-45d5f5fe2eb0';
const TABS: Array<[string,string]> = [['Çeki listesi','ceki'],['Belgeler','belgeler'],['Fatura & kur','fatura']];
async function main(){
  const b = await launchBrowser();
  const dir = resolve(process.cwd(),'artifacts/screens/ihracat-sevkiyat-detay-sekmeler');
  mkdirSync(dir,{recursive:true});
  for (const [w,h,kind] of [[1440,900,'desktop'],[390,844,'mobile']] as const) {
    const ctx = await b.newContext({ viewport:{width:w as number,height:h as number}, deviceScaleFactor:2, isMobile:(w as number)<500, hasTouch:(w as number)<500, locale:'tr-TR', timezoneId:'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p,{base:BASE, route:`/ihracat/sevkiyatlar/${SHIP}`, as:'admin'});
    for (const [tab,slug] of TABS) {
      await p.getByRole('tab',{name:tab}).click();
      await p.waitForTimeout(500);
      await p.screenshot({ path: resolve(dir, `${slug}-${kind}.png`), fullPage: true, animations:'disabled' });
    }
    await ctx.close();
  }
  await b.close();
  console.log('ok');
}
main().catch(e=>{console.error(e);process.exit(1);});
