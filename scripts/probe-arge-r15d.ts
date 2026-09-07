import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function run() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/arge/projeler', as: 'admin' });
  const res: any[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest('main')) return null;
      const cs = getComputedStyle(el);
      return {
        label: (el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label'),
        focusVisible: el.matches(':focus-visible'),
        ringShadow: cs.boxShadow.split(',').map((s) => s.trim()).filter((s) => !/0px 0px 0px 0px/.test(s)),
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset} ${cs.outlineColor}`,
        borderColor: cs.borderColor,
      };
    });
    if (f) res.push(f);
    if (res.length >= 4) break;
  }
  await page.screenshot({ path: 'artifacts/critic/arge-r15-focus-projeler.png' });
  // tablo satırı klavye odağı
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const rowState = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, label: (el.textContent ?? '').trim().slice(0, 30), focusVisible: el.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset} ${cs.outlineColor}`, bg: cs.backgroundColor };
  });
  await page.screenshot({ path: 'artifacts/critic/arge-r15-focus-row.png' });
  process.stdout.write(JSON.stringify({ res, rowState }, null, 1));
  await browser.close();
}
run().catch((e) => { console.error(e); process.exit(1); });
