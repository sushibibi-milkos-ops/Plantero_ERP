/** Tur 3 kritik probu (b): bildirim satırlarının klavye odak halkası + /onaylar mobil buton ölçüleri. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bildirimler', as: 'depo' });
    const row = page.locator('li a[href="/depo/skt"], li button').first();
    await row.evaluate((e: HTMLElement) => e.focus());
    // gerçek klavye odağı için Tab ile ulaş
    await page.evaluate(() => { const el = document.querySelector('li a, li button') as HTMLElement | null; el?.blur(); });
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const hit = await page.evaluate(() => { const a = document.activeElement as HTMLElement; return a?.closest('li') ? true : false; });
      if (hit) break;
    }
    out.notifRowFocus = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement;
      if (!a) return null;
      const cs = getComputedStyle(a);
      return { tag: a.tagName, text: a.textContent?.trim().slice(0, 30), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 80), matchesFocusVisible: a.matches(':focus-visible') };
    });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/onaylar', as: 'admin' });
    out.onaylarMobile = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button, a[data-slot="button"]')).filter((b) => /Reddet|Detay|Onayla/.test(b.textContent ?? ''));
      const opts = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
      return {
        actionButtons: btns.map((b) => ({ t: b.textContent?.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
        optionHeights: opts.map((o) => Math.round(o.getBoundingClientRect().height)),
        confidenceVisible: opts.slice(1, 4).map((o) => Array.from(o.querySelectorAll<HTMLElement>('span')).some((s) => /^%\d+$/.test(s.textContent?.trim() ?? '') && s.getBoundingClientRect().width > 0)),
        amountVisible: opts.slice(1, 4).map((o) => Array.from(o.querySelectorAll<HTMLElement>('span')).some((s) => /₺/.test(s.textContent ?? '') && s.getBoundingClientRect().width > 0)),
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      };
    });
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
