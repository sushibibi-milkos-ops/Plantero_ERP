/** Tur 16: boş durum (aramaya gerçekten yazarak), satır hover/focus, mobil kart yüksekliği. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  for (const [key, route] of [
    ['makineler', '/bakim/makineler'],
    ['planlar', '/bakim/planlar'],
    ['isemirleri', '/bakim/is-emirleri'],
  ] as const) {
    await openRoute(page, { base, route, as: 'admin' });
    const input = page.locator('input[type="search"], input[placeholder*="ara"], input[placeholder*="Ara"]').first();
    await input.fill('zzzyokk');
    await page.waitForTimeout(600);
    out[`empty_${key}`] = await page.evaluate(() => {
      const main = document.querySelector('main');
      const visRows = Array.from(document.querySelectorAll('tbody tr')).filter((r) => r.getBoundingClientRect().height > 0).length;
      const svgs = main ? main.querySelectorAll('svg').length : 0;
      return {
        visRows,
        text: (main?.textContent ?? '').replace(/\s+/g, ' ').slice(-260),
        svgs,
      };
    });
  }

  // satır hover + focus (makineler)
  await openRoute(page, { base, route: '/bakim/makineler', as: 'admin' });
  out.rowStates = await page.evaluate(() => {
    const tr = document.querySelector('tbody tr') as HTMLElement | null;
    if (!tr) return null;
    return { cls: tr.className, bgIdle: getComputedStyle(tr).backgroundColor, height: tr.getBoundingClientRect().height };
  });
  const firstRow = page.locator('tbody tr').first();
  await firstRow.hover();
  await page.waitForTimeout(200);
  out.rowHoverBg = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr') as Element).backgroundColor);
  await page.keyboard.press('Tab');
  out.focusRing = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, cls: String(el.className).slice(0, 80), outline: cs.outline, outlineWidth: cs.outlineWidth };
  });
  await ctx.close();

  // mobil kart yükseklikleri
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mpage = await mctx.newPage();
  for (const [key, route] of [
    ['makineler', '/bakim/makineler'],
    ['planlar', '/bakim/planlar'],
    ['isemirleri', '/bakim/is-emirleri'],
  ] as const) {
    await openRoute(mpage, { base, route, as: 'admin' });
    out[`cards_${key}`] = await mpage.evaluate(() => {
      const lists = Array.from(document.querySelectorAll('ul')).filter((u) => u.children.length >= 3);
      const ul = lists.sort((a, b) => b.children.length - a.children.length)[0];
      if (!ul) return null;
      const hs = Array.from(ul.children).map((c) => Math.round(c.getBoundingClientRect().height * 10) / 10);
      return { count: hs.length, min: Math.min(...hs), max: Math.max(...hs) };
    });
  }
  await mctx.close();

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
