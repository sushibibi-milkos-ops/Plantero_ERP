import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => {
  const main = document.querySelector('main');
  const mt = main.getBoundingClientRect().top;
  const rows = Array.from(document.querySelectorAll('tbody tr'));
  const first = rows[0] ? rows[0].getBoundingClientRect() : null;
  const thead = document.querySelector('thead');
  const theadCs = thead ? getComputedStyle(thead.querySelector('tr')||thead) : null;
  const th = Array.from(document.querySelectorAll('thead th')).map(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();return{t:(e.textContent||'').trim().slice(0,16),fs:cs.fontSize,bg:cs.backgroundColor,right:Math.round(r.right*10)/10,ta:cs.textAlign};});
  const money = Array.from(document.querySelectorAll('tbody td')).map(e=>{const r=e.getBoundingClientRect();return{t:(e.textContent||'').trim().slice(0,16),right:Math.round(r.right*10)/10};});
  return { mainTop: Math.round(mt), firstRowTop: first?Math.round(first.top):null, firstRowOffset: first?Math.round(first.top-mt):null, rowH: rows.map(r=>Math.round(r.getBoundingClientRect().height*10)/10), theadBg: theadCs?theadCs.backgroundColor:null, th, money: money.slice(0,16), docH: document.documentElement.scrollHeight };
})()`;
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const route of ['/arge/projeler', '/arge/receteler']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route, as: 'admin' });
    out[route] = await page.evaluate(FN);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main();
