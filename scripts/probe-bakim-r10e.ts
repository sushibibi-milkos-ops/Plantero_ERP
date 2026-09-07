/** Tur 10: mobil kart satır-2'de alt başlık ile metrik arasındaki yatay boşluk (planlar + makineler + is-emirleri). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function gaps(route: string) {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });
  const res = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.mobile-card-subtitle-row')) as HTMLElement[];
    return rows.map((left) => {
      const parent = left.parentElement as HTMLElement;
      const metric = parent.children[1] as HTMLElement | undefined;
      const lr = left.getBoundingClientRect();
      const mr = metric?.getBoundingClientRect();
      // gerçek metnin sağ kenarı (kutu değil)
      const range = document.createRange();
      let textRight = lr.left;
      left.querySelectorAll('*').forEach((e) => {
        if (e.children.length === 0 && (e.textContent || '').trim()) {
          range.selectNodeContents(e);
          textRight = Math.max(textRight, range.getBoundingClientRect().right);
        }
      });
      return {
        subtitle: (left.textContent || '').trim().slice(0, 34),
        metric: metric ? (metric.textContent || '').trim().slice(0, 20) : null,
        boxGap: mr ? Math.round((mr.left - lr.right) * 10) / 10 : null,
        textGap: mr ? Math.round((mr.left - textRight) * 10) / 10 : null,
      };
    });
  });
  await browser.close();
  return res;
}

(async () => {
  const out: any = {};
  out.planlar = await gaps('/bakim/planlar');
  out.makineler = (await gaps('/bakim/makineler')).slice(0, 6);
  out.isemirleri = await gaps('/bakim/is-emirleri');
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})();
