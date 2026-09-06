/** Tur 10: /bildirimler klavye odak doğrulaması (daha çok Tab). */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: unknown[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/bildirimler', as: 'depo', base, dark: false });
    await page.evaluate(() => (document.querySelector('main') as HTMLElement)?.focus?.());
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el || !el.closest('main')) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, role: el.getAttribute('role'), text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,30), boxShadow: cs.boxShadow.slice(0,90), outline: `${cs.outlineStyle} ${cs.outlineWidth} off:${cs.outlineOffset}`, fv: el.matches(':focus-visible') };
      });
      if (r) out.push(r);
    }
    await ctx.close();
  } finally { await browser.close(); }
  const p = resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r12c.json');
  writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
