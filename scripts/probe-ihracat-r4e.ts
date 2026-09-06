/** Tur 4 — mobil kart meta satırı: ayraç öncesi boşluk ve kırpma. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const route of ['/ihracat/sevkiyatlar','/ihracat/kurlar']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    out[route] = await p.evaluate(`(() => {
      const lis = Array.from(document.querySelectorAll('main li')).filter(li=>li.textContent.trim()).slice(0,3);
      return lis.map(li => {
        const parts = Array.from(li.querySelectorAll('span,div')).filter(e=>e.children.length===0 && e.textContent.trim());
        return parts.map(e => {
          const r = e.getBoundingClientRect();
          return { t: e.textContent.replace(/\\s+/g,'·').slice(0,26), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), sw: e.scrollWidth, truncated: e.scrollWidth > Math.ceil(r.width)+1 };
        });
      });
    })()`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(resolve(process.cwd(),'artifacts','critic','probe-ihracat-r4e.json'), JSON.stringify(out,null,1));
  console.log(JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
