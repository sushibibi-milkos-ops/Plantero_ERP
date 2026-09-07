/** Tur 10: OrderTimeline nokta renkleri + iş emri listesi/detayda kullanılan durum tonları. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTE = '/bakim/is-emirleri/9eb9086f-1ab6-46fe-8eac-8af18c53cd9f';

(async () => {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: ROUTE, as: 'admin' });
  const res = await page.evaluate(() => {
    const ol = document.querySelector('ol.space-y-4') as HTMLElement | null;
    const items = ol ? (Array.from(ol.children) as HTMLElement[]) : [];
    return items.map((li) => {
      const dot = li.querySelector('span[aria-hidden]') as HTMLElement | null;
      const label = (li.querySelector('span.font-medium') as HTMLElement | null)?.textContent?.trim();
      const r = dot?.getBoundingClientRect();
      return { label, dotBg: dot ? getComputedStyle(dot).backgroundColor : null, size: r ? [Math.round(r.width), Math.round(r.height)] : null };
    });
  });
  await browser.close();
  process.stdout.write(JSON.stringify(res, null, 1) + '\n');
})();
