/** Tur 6 — kritik: /bakim/is-emirleri/yeni 390 alt kaydırma görünümü + /bakim/oee 390 hat tablosu bölgesi. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
    await p.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await p.waitForTimeout(400);
    await p.screenshot({ path: 'artifacts/critic/bakim-r6-yeni-390-bottom.png' });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { route: '/bakim/oee', base, as: 'admin' });
    await p.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    await p.waitForTimeout(400);
    await p.screenshot({ path: 'artifacts/critic/bakim-r6-oee-390-bottom.png' });
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
