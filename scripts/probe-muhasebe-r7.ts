import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const route = process.argv.slice(2).find((a) => a.startsWith('/'))!;
const W = Number(process.env.PW ?? 390), H = Number(process.env.PH ?? 844);
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: W < 500, hasTouch: W < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route, as: 'admin', base: defaultBaseUrl() });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('[class*=snap-start]'));
    const sc = nodes[0] ? nodes[0].parentElement : null;
    const r = sc ? sc.getBoundingClientRect() : null;
    return {
      scroller: sc ? { sw: sc.scrollWidth, cw: sc.clientWidth, sl: Math.round(sc.scrollLeft) } : null,
      h1: (document.querySelector('h1')||{}).textContent, cnt: document.querySelectorAll('body *').length, url: location.pathname, body: document.body.innerText.slice(0,300), nodes: nodes.map((n) => { const b = n.getBoundingClientRect(); return { t: (n.textContent||'').replace(/\\s+/g,' ').trim().slice(0,34), left: Math.round(b.left), right: Math.round(b.right), fully: r ? (b.left >= r.left - 1 && b.right <= r.right + 1) : null }; }),
    };
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await ctx.close(); await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
