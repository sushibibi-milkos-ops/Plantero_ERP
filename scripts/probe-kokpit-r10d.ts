/**
 * Tur 10 kokpit prob-D: etkileşim geri bildirimi (kriter 8) + mobil dokunma hedefleri (kriter 9).
 * Klavye ile satır bağlantısına odaklanır, hover uygular, ölçer.
 *   tsx scripts/probe-kokpit-r10d.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r10');

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  mkdirSync(OUT, { recursive: true });
  try {
    // --- masaüstü: hover + focus
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
      locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
    });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/kokpit', as: 'admin' });

    const rowSel = 'main section a[class*="hover:bg-muted"]';
    const base0 = await page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, boxShadow: cs.boxShadow };
    }, rowSel);
    await page.hover(rowSel);
    await page.waitForTimeout(250);
    const hovered = await page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, transition: cs.transitionProperty + ' ' + cs.transitionDuration + ' ' + cs.transitionTimingFunction };
    }, rowSel);
    await page.evaluate((s) => { (document.querySelector(s) as HTMLElement).focus(); }, rowSel);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        tag: el.tagName, txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
        bg: cs.backgroundColor, boxShadow: cs.boxShadow, outline: cs.outlineWidth + ' ' + cs.outlineStyle,
        w: Math.round(b.width), h: Math.round(b.height),
      };
    });
    await page.screenshot({ path: resolve(OUT, 'focus-row-1440.png'), animations: 'disabled' });

    // "Tümü" bağlantısı ve buton odak
    const allLink = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('main section header a')).at(0) as HTMLElement | undefined;
      if (!a) return null;
      a.focus();
      const cs = getComputedStyle(a);
      const b = a.getBoundingClientRect();
      return { boxShadow: cs.boxShadow, outline: cs.outlineWidth + ' ' + cs.outlineStyle, w: Math.round(b.width), h: Math.round(b.height) };
    });

    // boş durum butonu
    const emptyBtn = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('main a,main button')).find((n) => /Satın alma siparişi oluştur|Tahsilat kaydet|İş emirlerini gör/.test(n.textContent || '')) as HTMLElement | undefined;
      if (!el) return null;
      el.focus();
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return { txt: (el.textContent || '').trim(), boxShadow: cs.boxShadow, h: Math.round(b.height), fs: cs.fontSize, transition: cs.transitionDuration };
    });
    out.desktop = { base0, hovered, focused, allLink, emptyBtn };
    await ctx.close();

    // --- mobil: tüm etkileşimli hedeflerin ölçüsü
    const mctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
    });
    const mpage = await mctx.newPage();
    await openRoute(mpage, { base, route: '/kokpit', as: 'admin' });
    out.mobile = await mpage.evaluate(`(() => {
      const r1 = (n) => Math.round(n * 10) / 10;
      const main = document.querySelector('main') || document.body;
      const els = Array.from(main.querySelectorAll('a[href],button,[role="button"],input,select'));
      const small = [];
      els.forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return;
        if (b.height < 44 || b.width < 44) small.push({ t: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40), tag: el.tagName, w: r1(b.width), h: r1(b.height) });
      });
      return { total: els.length, below44: small };
    })()`);
    await mctx.close();
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r10d.json'), JSON.stringify(out, null, 2));
  console.error(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
