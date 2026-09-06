/** Tur 9: odak halkası tam ölçümü (kırpılmamış box-shadow/outline). */
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
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    out['onaylar-j-full'] = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { role: el.getAttribute('role'), text: (el.textContent||'').trim().slice(0,30), boxShadow: cs.boxShadow, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, bg: cs.backgroundColor, fv: el.matches(':focus-visible') };
    });
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p2 = await ctx2.newPage();
    await openRoute(p2, { route: '/bildirimler', as: 'depo', base, dark: false });
    const res: unknown[] = [];
    for (let i = 0; i < 12; i++) {
      await p2.keyboard.press('Tab');
      const r = await p2.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el || !el.closest('main')) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,26), boxShadow: cs.boxShadow, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} off:${cs.outlineOffset}`, fv: el.matches(':focus-visible') };
      });
      if (r) res.push(r);
    }
    out['bildirimler-tab-full'] = res;
    // liste satırı hover
    await p2.hover('main ul > *:nth-child(2)').catch(() => {});
    out['bildirimler-hover'] = await p2.evaluate(() => {
      const li = document.querySelectorAll('main ul > *')[1] as HTMLElement;
      const a = li?.querySelector('a') as HTMLElement | null;
      return { liBg: getComputedStyle(li).backgroundColor, aBg: a ? getComputedStyle(a).backgroundColor : null };
    });
    await ctx2.close();
  } finally { await browser.close(); }
  const p = resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r9c.json');
  writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
