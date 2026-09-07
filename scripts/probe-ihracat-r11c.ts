/** Tur 11: odak halkası doğrulama (focus-visible eşleşmesi + tüm ilgili CSS özellikleri). */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  const out: any[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest('main')) return null;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName, cls: (el.className||'').toString().slice(0,60), label: (el.textContent ?? '').trim().slice(0, 24),
        fv: el.matches(':focus-visible'), fo: el.matches(':focus'),
        outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset,
        boxShadow: cs.boxShadow.slice(0, 120), borderColor: cs.borderColor,
      };
    });
    if (f) out.push(f);
    if (out.length >= 5) break;
  }
  await page.screenshot({ path: 'artifacts/critic/ihracat-r11-focus.png' });
  await ctx.close(); await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r11c.json', JSON.stringify(out, null, 1));
  console.error(JSON.stringify(out, null, 1));
}
main().catch((e)=>{console.error(e);process.exit(1);});
