import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => { const inputs = document.querySelector('main').querySelectorAll('input'); const el = inputs[4]; const out=[];
 let n = el; for (let i=0;i<3 && n;i++){ const cs=getComputedStyle(n); const r=n.getBoundingClientRect();
  out.push({tag:n.tagName.toLowerCase(), cls:(typeof n.className==='string'?n.className:'').slice(0,120), bw:cs.borderTopWidth, bc:cs.borderTopColor, shadow:cs.boxShadow, bg:cs.backgroundColor, w:Math.round(r.width), h:Math.round(r.height)});
  n = n.parentElement; }
 return out; })()`;
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler', as: 'admin' });
  console.log(JSON.stringify(await page.evaluate(FN), null, 1));
  await browser.close();
}
main();
