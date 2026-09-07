/** Tur 12: gerçek Tab sonrası tam odak stili (kesilmemiş boxShadow + outline + border). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['yeni', '/ihracat/sevkiyatlar/yeni'], ['kurlar', '/ihracat/kurlar']] as Array<[string, string]>) {
    await openRoute(page, { base: BASE, route, as: 'admin' });
    await page.locator('main').click({ position: { x: 4, y: 4 } });
    const chain: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, label: (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow, borderColor: cs.borderColor, matchesFV: el.matches(':focus-visible') };
      });
      if (r) chain.push(r);
    }
    out[k] = chain;
    await page.screenshot({ path: `artifacts/critic/ihracat-r12-focus-${k}.png`, animations: 'disabled' });
  }
  await ctx.close();
  await browser.close();
  mkdirSync('artifacts/critic', { recursive: true });
  writeFileSync('artifacts/critic/probe-ihracat-r12e.json', JSON.stringify(out, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
