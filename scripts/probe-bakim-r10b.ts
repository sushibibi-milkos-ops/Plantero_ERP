/** Tur 10: mobil DataTable kartlarında sondaki rozet/aksiyon hizası (is-emirleri) + makineler kartındaki etiketsiz sayı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function cards(route: string) {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });
  const res = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll('ul > li')).filter((li) => li.getBoundingClientRect().height > 40) as HTMLElement[];
    return lis.slice(0, 8).map((li) => {
      const r = li.getBoundingClientRect();
      const badge = li.querySelector('[data-slot="badge"], span[class*="rounded-full"]') as HTMLElement | null;
      const btn = li.querySelector('button') as HTMLElement | null;
      const texts = Array.from(li.querySelectorAll('*'))
        .filter((e) => e.children.length === 0 && (e.textContent || '').trim())
        .map((e) => {
          const b = (e as HTMLElement).getBoundingClientRect();
          return { t: (e.textContent || '').trim().slice(0, 28), left: Math.round(b.left), right: Math.round(b.right), size: getComputedStyle(e).fontSize };
        });
      return {
        h: Math.round(r.height * 10) / 10,
        cardRight: Math.round(r.right),
        badge: badge ? { text: (badge.textContent || '').trim(), right: Math.round(badge.getBoundingClientRect().right) } : null,
        hasBtn: !!btn,
        btnRight: btn ? Math.round(btn.getBoundingClientRect().right) : null,
        texts,
      };
    });
  });
  await browser.close();
  return res;
}

(async () => {
  const out: any = {};
  out.isemirleri = await cards('/bakim/is-emirleri');
  out.makineler = (await cards('/bakim/makineler')).slice(0, 3);
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})();
