import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const ROUTE = '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler';
const FN = `(() => {
  const main = document.querySelector('main');
  const inputs = Array.from(main.querySelectorAll('input')).map(i=>{const cs=getComputedStyle(i);const r=i.getBoundingClientRect();return{v:i.value,ro:i.readOnly,dis:i.disabled,bw:cs.borderTopWidth,bg:cs.backgroundColor,cursor:cs.cursor,w:Math.round(r.width),h:Math.round(r.height)};});
  const buttons = Array.from(main.querySelectorAll('button')).map(b=>({t:(b.textContent||'').trim().slice(0,22),dis:b.disabled}));
  return { inputs, buttons };
})()`;
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
  console.log(JSON.stringify(await page.evaluate(FN), null, 1));
  await browser.close();
}
main();
