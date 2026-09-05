/** Tur 7 klavye/odak probu — gerçek Tab/J tuşlarıyla focus-visible ölçümü. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

async function run() {
  const out: Record<string, unknown> = {};
  const browser = await launchBrowser();
  try {
    // /onaylar — J tuşu ile satır gezinme
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/onaylar', as: 'admin', base, dark: false });
      await page.keyboard.press('j');
      await page.waitForTimeout(200);
      out['onaylar-j'] = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, role: el.getAttribute('role'), text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,30),
          outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, boxShadow: cs.boxShadow.slice(0,120),
          matchesFocusVisible: el.matches(':focus-visible'), bg: cs.backgroundColor };
      });
      // Tab ile buton odağı
      await page.keyboard.press('Tab');
      await page.waitForTimeout(120);
      out['onaylar-tab'] = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, text: (el.textContent||'').trim().slice(0,24), outline: cs.outlineStyle+' '+cs.outlineWidth, boxShadow: cs.boxShadow.slice(0,120), fv: el.matches(':focus-visible') };
      });
      await ctx.close();
    }
    // /bildirimler — Tab ile satır bağlantısı
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/bildirimler', as: 'depo', base, dark: false });
      const res: unknown[] = [];
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press('Tab');
        const cur = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return null;
          const cs = getComputedStyle(el);
          const inList = !!el.closest('ul.divide-y');
          return { inList, tag: el.tagName, text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,28),
            outline: cs.outlineStyle+' '+cs.outlineWidth, boxShadow: cs.boxShadow.slice(0,120), fv: el.matches(':focus-visible') };
        });
        if (cur && (cur as { inList: boolean }).inList) { res.push(cur); if (res.length >= 2) break; }
      }
      out['bildirimler-tab-list'] = res;
      // hover ölçümü
      out['bildirimler-hover'] = await page.evaluate(() => {
        const a = document.querySelector('ul.divide-y a, ul.divide-y [tabindex]') as HTMLElement | null;
        return a ? { cls: a.className } : null;
      });
      await ctx.close();
    }
  } finally { await browser.close(); }
  writeFileSync(resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r7b.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
void run();
