import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => {
  const heads = Array.from(document.querySelectorAll('[role="columnheader"]')).map(e => {
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    const rng = document.createRange(); rng.selectNodeContents(e);
    const tr = rng.getBoundingClientRect();
    return { t:(e.textContent||'').trim(), cellRight:Math.round(r.right*10)/10, pr:cs.paddingRight, contentRight:Math.round((r.right-parseFloat(cs.paddingRight))*10)/10, textRight:Math.round(tr.right*10)/10 };
  });
  const main = document.querySelector('main');
  const leaves = Array.from(main.querySelectorAll('*')).filter(e => !e.children.length && (e.textContent||'').trim());
  const money = leaves.filter(e=>/^₺[\\d.,]+$/.test(e.textContent.trim())).map(e=>{const r=e.getBoundingClientRect();const rng=document.createRange();rng.selectNodeContents(e);const tr=rng.getBoundingClientRect();return{t:e.textContent.trim(),boxRight:Math.round(r.right*10)/10,textRight:Math.round(tr.right*10)/10,top:Math.round(r.top)};});
  return { heads, money };
})()`;
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler', as: 'admin' });
  console.log(JSON.stringify(await page.evaluate(FN), null, 1));
  await browser.close();
}
main();
