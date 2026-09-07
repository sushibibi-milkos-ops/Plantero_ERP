import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  const log: Array<Record<string, unknown>> = [];
  let n = 0;
  for (let i = 0; i < 45 && n < 8; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body || !e.closest('main')) return null;
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      return { text: (e.innerText || (e as HTMLInputElement).placeholder || e.tagName).trim().slice(0, 22).replace(/\n/g, ' '), tag: e.tagName, outline: `${cs.outlineWidth} ${cs.outlineStyle}`, boxShadow: cs.boxShadow.slice(0, 200), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    });
    if (!info) continue;
    n++;
    const r = info.rect as { x: number; y: number; w: number; h: number };
    await page.screenshot({ path: `artifacts/critic/bakim-r12-focus-${n}.png`, clip: { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.w + 20, height: r.h + 20 } });
    log.push({ n, ...info });
  }
  console.log(JSON.stringify(log, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
