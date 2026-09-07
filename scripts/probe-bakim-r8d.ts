/** Tur 8 — kriter 8 (etkileşim geri bildirimi): focus ring, active scale, satır hover. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/is-emirleri', base, as: 'admin' });

  // 1) Birincil buton focus ring + active
  const btn = page.locator('a:has-text("Arıza bildir"), button:has-text("Arıza bildir")').first();
  await btn.focus();
  const focusRing = await btn.evaluate((el) => { const cs = getComputedStyle(el); return { outline: cs.outlineWidth + ' ' + cs.outlineStyle, boxShadow: cs.boxShadow.slice(0, 90), transition: cs.transitionProperty + ' ' + cs.transitionDuration }; });
  // active transform
  const activeTransform = await btn.evaluate((el) => el.className);

  // 2) Tablo satırı hover arka planı
  const row = page.locator('tbody tr').first();
  const rowBefore = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  await row.hover();
  await page.waitForTimeout(120);
  const rowAfter = await row.evaluate((el) => getComputedStyle(el).backgroundColor);

  // 3) Satır klavye odağı
  const rowFocus = await row.evaluate((el) => { const a = el.querySelector('a,button,[tabindex]'); if (!a) return null; (a as HTMLElement).focus(); const cs = getComputedStyle(a); return { tag: a.tagName, outline: cs.outlineWidth + ' ' + cs.outlineStyle, boxShadow: cs.boxShadow.slice(0, 90) }; });

  console.log(JSON.stringify({ focusRing, activeTransform, rowBefore, rowAfter, rowFocus }, null, 1));
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
