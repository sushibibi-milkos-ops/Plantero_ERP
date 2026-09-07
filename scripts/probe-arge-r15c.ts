import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function run() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/arge/projeler', as: 'admin' });
  const out: any[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest('main')) return null;
      const cs = getComputedStyle(el);
      return { label: (el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label'), tag: el.tagName, boxShadow: cs.boxShadow, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset}`, borderColor: cs.borderColor };
    });
    if (f) out.push(f);
    if (out.length >= 6) break;
  }
  // tablo satırına odak
  await page.evaluate(() => (document.querySelector('tbody tr') as HTMLElement)?.focus());
  const rowFocus = await page.evaluate(() => {
    const el = document.querySelector('tbody tr') as HTMLElement;
    return { tabindex: el?.getAttribute('tabindex'), role: el?.getAttribute('role') };
  });
  process.stdout.write(JSON.stringify({ focusChain: out, rowFocus }, null, 1));
  await browser.close();
}
run().catch((e) => { console.error(e); process.exit(1); });
