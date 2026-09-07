import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  const out: Record<string, unknown> = {};
  // Tab ile "Arıza bildir"e ulaş
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText?.trim() === 'Arıza bildir');
    if (hit) break;
  }
  out.cta = await page.evaluate(() => {
    const e = document.activeElement as HTMLElement;
    const cs = getComputedStyle(e);
    return {
      matchesFocusVisible: e.matches(':focus-visible'),
      matchesFocus: e.matches(':focus'),
      outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      boxShadow: cs.boxShadow,
      ringColorVar: cs.getPropertyValue('--tw-ring-color'),
      ringShadowVar: cs.getPropertyValue('--tw-ring-shadow'),
      borderColor: cs.borderColor,
      cls: e.className,
    };
  });
  const box = await page.evaluate(() => { const r = (document.activeElement as HTMLElement).getBoundingClientRect(); return { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 }; });
  await page.screenshot({ path: 'artifacts/critic/bakim-r12-focus-cta.png', clip: box });
  // arama kutusu
  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  await page.locator('input[type="search"], input').first().focus();
  await page.keyboard.press('Tab'); await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  out.input = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e); return { tag: e.tagName, fv: e.matches(':focus-visible'), outline: `${cs.outlineWidth} ${cs.outlineStyle}`, boxShadow: cs.boxShadow.slice(0,120), borderColor: cs.borderColor }; });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
