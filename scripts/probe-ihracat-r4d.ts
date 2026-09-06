/** Tur 4 — sipariş seçici açık hâlde ekran görüntüsü + seçenek metni. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [kind,w,h] of [['desktop',1440,900],['mobile',390,844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w<500, hasTouch: w<500, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: '/ihracat/sevkiyatlar/yeni', as: 'admin' });
    await p.getByRole('combobox').first().click();
    await p.waitForTimeout(500);
    out[kind] = await p.evaluate(`Array.from(document.querySelectorAll('[role=option]')).map(o=>({text:o.textContent.replace(/\\s+/g,' ').trim(), h:Math.round(o.getBoundingClientRect().height)}))`);
    await p.screenshot({ path: resolve(process.cwd(),'artifacts','screens','ihracat-sevkiyatlar-yeni',`${kind}-combobox-open.png`), animations:'disabled' });
    // seçip devam et
    await p.locator('[role=option]').first().click();
    await p.waitForTimeout(600);
    await p.screenshot({ path: resolve(process.cwd(),'artifacts','screens','ihracat-sevkiyatlar-yeni',`${kind}-order-selected.png`), fullPage:true, animations:'disabled' });
    out[kind+'Chip'] = await p.evaluate(`(document.querySelector('main')?.textContent||'').replace(/\\s+/g,' ').slice(0,400)`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(resolve(process.cwd(),'artifacts','critic','probe-ihracat-r4d.json'), JSON.stringify(out,null,1));
  console.log(JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
