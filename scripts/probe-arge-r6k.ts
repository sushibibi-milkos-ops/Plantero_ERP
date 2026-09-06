import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => { const out=[]; const els = document.querySelector('main').querySelectorAll('input, button, [data-slot=select-trigger]');
 for (let i=0;i<els.length;i++){ const el=els[i]; const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
   if (r.width<20||r.height<16) continue;
   out.push({tag:el.tagName.toLowerCase(), v:(el.value!==undefined?el.value:(el.textContent||'').trim()).slice(0,14), bw:cs.borderTopWidth, bc:cs.borderTopColor, shadow:cs.boxShadow.slice(0,90), outline:cs.outlineWidth+' '+cs.outlineColor, w:Math.round(r.width), h:Math.round(r.height)});
 } return out; })()`;
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler', as: 'admin' });
  console.log('V2', JSON.stringify(await page.evaluate(FN), null, 1));
  await browser.close();
}
main();
