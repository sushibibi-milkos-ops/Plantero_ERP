import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => {
  const rows = Array.from(document.querySelectorAll('.mobile-card-subtitle-row'));
  return rows.map(r => {
    const kids = Array.from(r.children).map(c => { const b=c.getBoundingClientRect(); return { t:(c.textContent||'').replace(/\\s+/g,'·').slice(0,26), left:Math.round(b.left*10)/10, right:Math.round(b.right*10)/10, cls:(typeof c.className==='string'?c.className:'').slice(0,60) }; });
    let gap = null;
    if (kids.length >= 2) gap = Math.round((kids[1].left - kids[0].right)*10)/10;
    return { txt:(r.textContent||'').replace(/\\s+/g,' ').slice(0,40), kids, gap };
  });
})()`;
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const route of ['/arge/receteler', '/arge/projeler']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route, as: 'admin' });
    out[route] = await page.evaluate(FN);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main();
