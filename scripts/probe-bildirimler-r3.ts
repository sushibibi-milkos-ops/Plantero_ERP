/** Tur 3 kritik probu: bildirimler modülü (içerik alanı font kademeleri, hover/focus, sıra, mobil dip boşluğu). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // --- /onaylar (admin) masaüstü ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/onaylar', as: 'admin' });
    out.onaylarDesktop = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const sizes: Record<string, string[]> = {};
      for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
        const t = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent?.trim()).join('');
        if (!t) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        const k = cs.fontSize.replace('px', '');
        (sizes[k] ||= []).push(`${t.slice(0, 26)}|${cs.fontWeight}`);
      }
      const opts = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
      return {
        sizes: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, { n: v.length, sample: v.slice(0, 4) }])),
        optionCount: opts.length,
        optionHeights: opts.map((o) => Math.round(o.getBoundingClientRect().height)),
        listboxWidth: Math.round((document.querySelector('[role="listbox"]') as HTMLElement)?.getBoundingClientRect().width ?? 0),
        firstOptionCursor: opts[0] ? getComputedStyle(opts[0]).cursor : null,
        // güven rozeti renk dağılımı
        badges: Array.from(document.querySelectorAll<HTMLElement>('[role="option"] span')).filter((s) => /^%\d+$/.test(s.textContent?.trim() ?? '')).map((s) => ({ t: s.textContent?.trim(), bg: getComputedStyle(s).backgroundColor, c: getComputedStyle(s).color })),
        amountsTabular: Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).slice(0, 4).map((o) => {
          const cand = Array.from(o.querySelectorAll<HTMLElement>('*')).find((e) => /₺/.test(e.textContent ?? '') && e.children.length === 0);
          return cand ? { t: cand.textContent, fvn: getComputedStyle(cand).fontVariantNumeric, ta: getComputedStyle(cand).textAlign } : null;
        }),
      };
    });
    // hover + focus davranışı
    const opt = page.locator('[role="option"]').nth(3);
    const before = await opt.evaluate((e) => getComputedStyle(e).backgroundColor);
    await opt.hover();
    await page.waitForTimeout(250);
    const after = await opt.evaluate((e) => getComputedStyle(e).backgroundColor);
    out.onaylarHover = { before, after, changed: before !== after };
    await ctx.close();
  }

  // --- /bildirimler (depo) ---
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bildirimler', as: 'depo' });
    const key = vp.width === 1440 ? 'bildirimlerDesktop' : 'bildirimlerMobile';
    out[key] = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const sizes: Record<string, string[]> = {};
      for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
        const t = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent?.trim()).join('');
        if (!t) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        (sizes[cs.fontSize.replace('px', '')] ||= []).push(`${t.slice(0, 26)}|${cs.fontWeight}`);
      }
      const lis = Array.from(document.querySelectorAll<HTMLElement>('ul li'));
      const listUl = document.querySelector('ul');
      const body = lis[0]?.querySelector('p');
      return {
        sizes: Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, { n: v.length, sample: v.slice(0, 4) }])),
        rowCount: lis.length,
        rowHeights: lis.map((l) => Math.round(l.getBoundingClientRect().height)),
        listWidth: Math.round((listUl as HTMLElement)?.getBoundingClientRect().width ?? 0),
        bodyWidth: body ? Math.round(body.getBoundingClientRect().width) : 0,
        bodyMaxW: body ? getComputedStyle(body).maxWidth : null,
        markAllBtn: (() => { const b = Array.from(document.querySelectorAll<HTMLElement>('button')).find((x) => /Tümünü okundu/.test(x.textContent ?? '')); const r = b?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; })(),
        tabs: Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]')).map((t) => ({ t: t.textContent?.trim(), h: Math.round(t.getBoundingClientRect().height) })),
        docScrollH: document.documentElement.scrollHeight,
        lastRowBottom: lis.length ? Math.round(lis[lis.length - 1]!.getBoundingClientRect().bottom + window.scrollY) : 0,
        bottomNavTop: (() => { const n = document.querySelector('nav[class*="fixed"], [data-slot="mobile-nav"]') as HTMLElement | null; return n ? Math.round(n.getBoundingClientRect().top) : null; })(),
      };
    });
    if (vp.width === 1440) {
      const row = page.locator('ul li a, ul li button').first();
      const b = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
      await row.hover();
      await page.waitForTimeout(250);
      const a = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
      out.bildirimlerHover = { before: b, after: a, changed: b !== a };
      await page.keyboard.press('Tab');
      out.focusVisible = await page.evaluate(() => { const el = document.activeElement as HTMLElement; const cs = el ? getComputedStyle(el) : null; return { tag: el?.tagName, text: el?.textContent?.trim().slice(0, 30), outline: cs?.outlineWidth, shadow: cs?.boxShadow?.slice(0, 60) }; });
    }
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
