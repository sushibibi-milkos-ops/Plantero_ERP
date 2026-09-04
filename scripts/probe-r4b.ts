import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: any = {};
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/muhasebe/donemler', as: 'admin' });
    out.donemler = await page.evaluate(`(() => {
      const frame = document.querySelector('div.max-w-\\\\[720px\\\\] > div');
      const table = document.querySelector('table');
      const thead = document.querySelector('thead tr');
      const f = frame ? frame.getBoundingClientRect() : null;
      const t = table ? table.getBoundingClientRect() : null;
      const h = thead ? thead.getBoundingClientRect() : null;
      return { frameW: f && Math.round(f.width), frameRight: f && Math.round(f.right), tableW: t && Math.round(t.width), tableRight: t && Math.round(t.right), theadRight: h && Math.round(h.right) };
    })()`);
    await openRoute(page, { base, route: '/muhasebe/faturalar/b86e14ab-5d5b-4010-b3f2-ed3e1bb3d664', as: 'admin' });
    out.chain = await page.evaluate(`(() => {
      const cur = document.querySelector('[aria-current="true"]');
      let sc = cur; while (sc && sc !== document.body) { const cs = getComputedStyle(sc); if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') break; sc = sc.parentElement; }
      const c = cur && cur.getBoundingClientRect(); const s = sc && sc.getBoundingClientRect();
      return { curRight: c && Math.round(c.right), curLeft: c && Math.round(c.left), scRight: s && Math.round(s.right), scLeft: s && Math.round(s.left), sw: sc && sc.scrollWidth, cw: sc && sc.clientWidth, scrollLeft: sc && sc.scrollLeft, hiddenPx: c && s ? Math.round(c.right - s.right) : null };
    })()`);
    await ctx.close();
  } finally { await browser.close(); }
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
