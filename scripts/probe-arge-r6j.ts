import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => { const out = []; const inputs = document.querySelector('main').querySelectorAll('input'); for (let i=0;i<Math.min(4,inputs.length);i++){ const el=inputs[i]; const cs=getComputedStyle(el); out.push({v:el.value,dis:el.disabled,color:cs.color,opacity:cs.opacity,bg:cs.backgroundColor,border:cs.borderTopColor+' '+cs.borderTopWidth,cursor:cs.cursor}); } return out; })()`;
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route: '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/receteler', as: 'admin' });
  const a = await page.evaluate(FN);
  console.log('V2_READONLY', JSON.stringify(a));
  await page.getByRole('button', { name: /^v1/ }).first().click();
  await page.waitForTimeout(2500);
  const b = await page.evaluate(FN);
  console.log('V1_EDITABLE', JSON.stringify(b));
  await browser.close();
}
main();
