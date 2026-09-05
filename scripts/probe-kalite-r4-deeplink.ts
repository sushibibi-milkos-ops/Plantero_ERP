/** Tur-4: ?lot= derin bağlantısı çözülürken ekranda ne yazdığını 100 ms aralıklarla örnekler. */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  // önce oturum
  await openRoute(page, { base, route: '/kalite/izlenebilirlik', as: 'admin' });
  const samples: Array<{ t: number; busy: number; skeleton: number; head: string }> = [];
  const t0 = Date.now();
  await page.goto(`${base}/kalite/izlenebilirlik?lot=PL-260808-H1-12`, { waitUntil: 'commit' });
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => {
      const main = document.querySelector('main');
      const txt = (main?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return {
        busy: document.querySelectorAll('[aria-busy="true"]').length,
        skeleton: document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length,
        head: txt.slice(120, 260),
      };
    }).catch(() => null);
    if (s) samples.push({ t: Date.now() - t0, ...s });
    if (s && /Miktar dengesi/i.test(s.head)) break;
    await page.waitForTimeout(100);
  }
  console.log(JSON.stringify(samples, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
