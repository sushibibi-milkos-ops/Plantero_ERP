/**
 * Tur 13b — boş durum + etkileşim geri bildirimi doğrulaması (mobile-cards.tsx değiştiği için regresyon kontrolü).
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  {
  const page = await ctx.newPage();
  for (const [key, route, sel] of [
    ['makineler', '/bakim/makineler', 'input[aria-label="Tabloda ara"]'],
    ['planlar', '/bakim/planlar', 'input[aria-label="Tabloda ara"]'],
    ['isemirleri', '/bakim/is-emirleri', 'input[aria-label="İş emirlerinde ara"]'],
  ] as const) {
    await openRoute(page, { base, route, as: 'admin' });
    await page.fill(sel, 'zzzqqq-yok');
    await page.waitForTimeout(700);
    out[`bos_${key}`] = await page.evaluate(() => {
      const main = document.querySelector('main');
      const txt = (main as HTMLElement).innerText;
      const svgs = Array.from(main!.querySelectorAll('svg')).length;
      const rows = main!.querySelectorAll('tbody tr').length;
      return { rows, hasEmptyText: /Eşleşen kayıt yok|kayıt yok|bulunamadı/i.test(txt), snippet: txt.split('\n').filter((l) => /yok|deneyin|temizle/i.test(l)).slice(0, 4), svgs };
    });
  }
  }

  await ctx.close();

  // Etkileşim: satır hover + focus-visible (temiz bağlam)
  const ctxI = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctxI.newPage();
  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  out.rowHoverFocus = await page.evaluate(() => {
    const tr = (Array.from(document.querySelectorAll('tbody tr')).find((t) => (t as HTMLElement).offsetParent !== null) as HTMLElement);
    const before = getComputedStyle(tr).backgroundColor;
    return { before };
  });
  await page.hover('tbody tr:visible');
  await page.waitForTimeout(200);
  out.rowHoverAfter = await page.evaluate(() => getComputedStyle((Array.from(document.querySelectorAll('tbody tr')).find((t) => (t as HTMLElement).offsetParent !== null) as HTMLElement)).backgroundColor);
  await page.keyboard.press('Tab');
  out.focusRing = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, label: (el.getAttribute('aria-label') ?? el.innerText ?? '').slice(0, 40), outline: cs.outline, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow.slice(0, 90) };
  });
  await ctxI.close();

  // 390: mobil kart odak + dokunma hedefi (mobile-cards regresyonu)
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
  const page2 = await ctx2.newPage();
  await openRoute(page2, { base, route: '/bakim/is-emirleri', as: 'admin' });
  out.mobilKartLinkBoyut = await page2.evaluate(() => {
    return Array.from(document.querySelectorAll('main ul > li a, main ul > li')).slice(0, 8).map((e) => {
      const b = e.getBoundingClientRect();
      return { tag: e.tagName, w: Math.round(b.width), h: Math.round(b.height * 10) / 10 };
    });
  });
  await ctx2.close();

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
