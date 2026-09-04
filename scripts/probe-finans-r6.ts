/**
 * Tur 6 kritik probu: sticky sütunlar arasında kalan para hücrelerinin 390px'te gerçekten
 * kırpılıp kırpılmadığını ölçer (kriter 5/6). Çıktı: tek satır JSON.
 *   pnpm tsx scripts/probe-finans-r6.ts /finans/krediler/<id>
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const route = process.argv[2] ?? '/finans/krediler';
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });

  const result = await page.evaluate(() => {
    const out: unknown[] = [];
    const tables = [...document.querySelectorAll('table')];
    for (const [ti, t] of tables.entries()) {
      const rows = [...t.querySelectorAll('tbody tr')].slice(0, 3);
      const stickyRight = t.querySelector('tbody tr td.sticky.right-0') as HTMLElement | null;
      const srLeft = stickyRight ? stickyRight.getBoundingClientRect().left : Infinity;
      for (const r of rows) {
        for (const [ci, cell] of [...r.querySelectorAll('td')].entries()) {
          const el = cell as HTMLElement;
          const rect = el.getBoundingClientRect();
          const isSticky = el.classList.contains('sticky');
          if (isSticky) continue;
          // görünür alan: 0..srLeft aralığı ve viewport
          const visibleRight = Math.min(rect.right, srLeft, window.innerWidth);
          const visibleLeft = Math.max(rect.left, 0);
          const visible = Math.max(0, visibleRight - visibleLeft);
          if (rect.width > 0 && visible < rect.width - 1) {
            out.push({
              table: ti,
              col: ci,
              text: (el.textContent ?? '').trim(),
              width: Math.round(rect.width),
              visible: Math.round(visible),
              hiddenPx: Math.round(rect.width - visible),
              overflowHidden: getComputedStyle(el).overflow,
              textOverflow: getComputedStyle(el).textOverflow,
            });
          }
        }
      }
    }
    return { route: location.pathname, innerWidth: window.innerWidth, clipped: out };
  });

  console.log(JSON.stringify(result));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
