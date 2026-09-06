import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const FN = `(() => Array.from(document.querySelectorAll('nav a, [role="tablist"] a, a')).filter(a=>/^(Pano|Deneme Reçeteleri)$/.test((a.textContent||'').trim())).map(a=>{const r=a.getBoundingClientRect();return{t:a.textContent.trim(),w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10};}))`;
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const vp of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp === 390 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: vp < 500, hasTouch: vp < 500, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: '/arge/projeler/cca72a4e-2d24-4600-a6bd-2811d51627ba/board', as: 'admin' });
    out[String(vp)] = await page.evaluate(FN);
    await ctx.close();
  }
  console.log(JSON.stringify(out));
  await browser.close();
}
main();
