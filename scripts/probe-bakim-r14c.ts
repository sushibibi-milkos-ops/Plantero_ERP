/**
 * Tur 14 — boş durum + etkileşim geri bildirimi doğrulaması (kriter 7 ve 8).
 * 3 liste: arama kutusuna eşleşmeyen metin yazılır, boş durum metni/ikonu okunur.
 * Ayrıca satır hover arka planı ve focus-visible outline ölçülür.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const LISTS: Array<[string, string]> = [
  ['makineler', '/bakim/makineler'],
  ['planlar', '/bakim/planlar'],
  ['isemirleri', '/bakim/is-emirleri'],
];

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};

  for (const [key, route] of LISTS) {
    await openRoute(page, { base, route, as: 'admin' });

    // hover + focus (ilk satır)
    const row = page.locator('tbody tr:visible').first();
    const before = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    await row.hover();
    await page.waitForTimeout(200);
    const after = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor };
    });

    const input = page.locator('input[data-slot="input"]:visible').first();
    await input.fill('zzzz-yok-zzzz');
    await page.waitForTimeout(900);
    const empty = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return null;
      const rows = main.querySelectorAll('tbody tr').length;
      const svgs = Array.from(main.querySelectorAll('svg')).length;
      const txt = (main as HTMLElement).innerText.replace(/\s+/g, ' ');
      return { rows, svgs, hasEmptyText: /Eşleşen kayıt yok|kayıt bulunamadı|sonuç yok/i.test(txt), tail: txt.slice(-260) };
    });

    out[key] = { hoverBefore: before, hoverAfter: after, focus, empty };
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
