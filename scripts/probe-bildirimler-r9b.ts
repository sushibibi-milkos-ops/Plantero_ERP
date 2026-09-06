/** Tur 8 klavye/hover doğrulaması. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const out: Record<string, unknown> = {};
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/onaylar', as: 'admin', base, dark: false });
    const before = await page.evaluate(() => getComputedStyle(document.querySelectorAll('[role="option"]')[3] as Element).backgroundColor);
    await page.hover('[role="option"]:nth-of-type(4)').catch(() => {});
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => getComputedStyle(document.querySelectorAll('[role="option"]')[3] as Element).backgroundColor);
    out['onaylar-hover'] = { before, after, changed: before !== after };
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    out['onaylar-j'] = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null; if (!el) return null;
      const cs = getComputedStyle(el);
      return { role: el.getAttribute('role'), selected: el.getAttribute('aria-selected'), text: (el.textContent||'').trim().slice(0,28), boxShadow: cs.boxShadow.slice(0,90), outline: cs.outlineStyle, fv: el.matches(':focus-visible') };
    });
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p2 = await ctx2.newPage();
    await openRoute(p2, { route: '/bildirimler', as: 'depo', base, dark: false });
    const seq: unknown[] = [];
    for (let i = 0; i < 20; i++) {
      await p2.keyboard.press('Tab');
      const cur = await p2.evaluate(() => {
        const el = document.activeElement as HTMLElement | null; if (!el) return null;
        const cs = getComputedStyle(el);
        const inMain = !!el.closest('main');
        return inMain ? { tag: el.tagName, text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,26), boxShadow: cs.boxShadow.slice(0,70), outline: cs.outlineStyle, fv: el.matches(':focus-visible') } : null;
      });
      if (cur) seq.push(cur);
    }
    out['bildirimler-tab'] = seq;
    await ctx2.close();
  } finally { await browser.close(); }
  const p = resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r9b.json');
  writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2).slice(0, 2500));
}
main().catch((e) => { console.error(e); process.exit(1); });
