/** Tur 8 — mobilde DocumentChain'in mount sonrası kaydırma konumu (fullPage yakalama etkisi olmadan). */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const route = process.argv[2] ?? '/kalite/geri-cagirma';
  const out = process.argv[3] ?? '/tmp/chain.png';
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: defaultBaseUrl(), route, as: 'admin' });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(String.raw`(() => {
    var el = document.querySelector('[aria-label="Belge zinciri"]');
    if (!el) return { found: false };
    var cards = Array.prototype.slice.call(el.querySelectorAll('.snap-start'));
    return { found: true, scrollLeft: Math.round(el.scrollLeft), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      cards: cards.map(function (c) { var r = c.getBoundingClientRect(); return { text: String(c.textContent||'').trim().slice(0,40), left: Math.round(r.left), right: Math.round(r.right), current: c.getAttribute('aria-current') === 'true' }; }) };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  const el = await page.$('[aria-label="Belge zinciri"]');
  if (el) await el.screenshot({ path: out });
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
