/** Tur 16 — buton odak halkası (geçiş sonrası) ve satır odağı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler'],
    ['precete', '/arge/projeler/76e0b20f-4594-4cbf-b9e0-1c21327cb0bd/receteler']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    const seen: unknown[] = [];
    await page.locator('body').click({ position: { x: 700, y: 95 } });
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(220);
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null; if (!el) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, t: (el.textContent ?? '').trim().slice(0, 22), outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 120) };
      });
      if (f) seen.push(f);
    }
    out[key] = seen;
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });
