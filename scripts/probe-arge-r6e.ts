import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const ROUTE = '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/board';
const FN = `(() => {
  const main = document.querySelector('main');
  const scroller = Array.from(main.querySelectorAll('*')).filter(e => e.scrollWidth > e.clientWidth + 4).map(e => ({ cls:(typeof e.className==='string'?e.className:'').slice(0,70), sw:e.scrollWidth, cw:e.clientWidth, scrollLeft:Math.round(e.scrollLeft) }));
  const cols = Array.from(main.querySelectorAll('[data-column-id], [data-slot="board-column"]')).map(e=>{const r=e.getBoundingClientRect();return{t:(e.textContent||'').replace(/\\s+/g,' ').slice(0,22), w:Math.round(r.width), h:Math.round(r.height), left:Math.round(r.left)};});
  const cards = Array.from(main.querySelectorAll('[data-card-id]')).map(e=>{const r=e.getBoundingClientRect();return{t:(e.textContent||'').replace(/\\s+/g,' ').slice(0,24), w:Math.round(r.width), h:Math.round(r.height)};});
  const chips = Array.from(main.querySelectorAll('button')).filter(b=>/rounded-full/.test(typeof b.className==='string'?b.className:'')).map(b=>{const r=b.getBoundingClientRect();return{t:(b.textContent||'').trim().slice(0,16), w:Math.round(r.width), h:Math.round(r.height)};});
  return { scroller, cols, cards, chips, docH: document.documentElement.scrollHeight };
})()`;
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    out[String(vp.width)] = await page.evaluate(FN);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main();
