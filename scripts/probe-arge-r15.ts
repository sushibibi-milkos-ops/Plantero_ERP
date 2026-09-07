/** Tur 15 kritik ölçümü — arge modülü (salt okuma). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '3c293a91-d8d6-4817-8c0d-b0df4223b5ee';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // --- Liste route'ları: ofset + para hücresi + hover/focus + tabular ---
  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']] as const) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
      const page = await ctx.newPage();
      await openRoute(page, { base, route, as: 'admin' });
      const tag = `${key}_${vp.width}`;
      out[tag] = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        const mainTop = main.getBoundingClientRect().top;
        const row = document.querySelector('tbody tr') ?? document.querySelector('main ul > li');
        const thead = document.querySelector('thead tr');
        const h1 = document.querySelector('h1');
        const money = [...document.querySelectorAll('tbody td, main ul > li')]
          .flatMap((el) => [...el.querySelectorAll('*')].filter((n) => /₺/.test(n.textContent ?? '') && n.children.length === 0));
        const moneyInfo = money.map((n) => {
          const cs = getComputedStyle(n as Element);
          const host = (n as Element).closest('[title],[aria-label]');
          return {
            text: (n.textContent ?? '').trim(),
            color: cs.color,
            fvn: cs.fontVariantNumeric,
            align: cs.textAlign,
            title: host?.getAttribute('title') ?? null,
            aria: host?.getAttribute('aria-label') ?? null,
            srOnly: !!(n as Element).closest('td,li')?.querySelector('.sr-only'),
          };
        });
        return {
          mainTop,
          h1Offset: h1 ? Math.round(h1.getBoundingClientRect().top - mainTop) : null,
          theadOffset: thead ? Math.round(thead.getBoundingClientRect().top - mainTop) : null,
          firstRowViewport: row ? Math.round(row.getBoundingClientRect().top) : null,
          firstRowOffsetInMain: row ? Math.round(row.getBoundingClientRect().top - mainTop) : null,
          rowHeight: row ? Math.round(row.getBoundingClientRect().height * 10) / 10 : null,
          money: moneyInfo,
          hedefKelimesi: /hedef/i.test(main.textContent ?? ''),
        };
      });
      // hover + focus (yalnız masaüstü)
      if (vp.width === 1440) {
        const tr = page.locator('tbody tr').first();
        if (await tr.count()) {
          await tr.hover();
          out[`${tag}_hoverBg`] = await tr.evaluate((el) => getComputedStyle(el).backgroundColor);
        }
        await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
        out[`${tag}_focus`] = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { tag: el.tagName, label: (el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label'), outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 60) };
        });
      }
      // boş durum
      const search = page.locator('input[aria-label="Tabloda ara"], input[data-slot="input"]').first();
      if (await search.count()) {
        await search.fill('zzzqqq');
        await page.waitForTimeout(700);
        out[`${tag}_empty`] = await page.evaluate(() => {
          const main = document.querySelector('main')!;
          const t = (main.textContent ?? '');
          return { hasSvg: !!main.querySelector('svg'), text: t.replace(/\s+/g, ' ').slice(-220) };
        });
      }
      await ctx.close();
    }
  }

  // --- Deneme reçetesi çalışma alanı ---
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    const tag = `precete_${vp.width}`;
    out[tag] = await page.evaluate(() => {
      // dolu-vurgu buton sayısı
      const solid: Array<Record<string, unknown>> = [];
      for (const b of [...document.querySelectorAll('button, a[data-slot="button"]')]) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const bg = getComputedStyle(b).backgroundColor;
        const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(bg);
        let green = false;
        if (m) green = Number(m[2]) > 0.08 && Number(m[3]) > 120 && Number(m[3]) < 190;
        const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
        if (rgb) { const g = Number(rgb[2]); green = g > Number(rgb[1]) + 25 && g > Number(rgb[3]) + 25; }
        if (green) solid.push({ text: (b.textContent ?? '').trim().slice(0, 30) || b.getAttribute('aria-label'), bg, w: Math.round(r.width), h: Math.round(r.height) });
      }
      // ₺ öneki ile ilk rakam arası (canvas ölçümü)
      const gaps: Array<Record<string, unknown>> = [];
      const canvas = document.createElement('canvas');
      const cx = canvas.getContext('2d')!;
      for (const wrap of [...document.querySelectorAll('div,span,label')]) {
        const input = wrap.querySelector(':scope > input');
        const pre = [...wrap.querySelectorAll(':scope > span')].find((s) => (s.textContent ?? '').trim() === '₺');
        if (!input || !pre) continue;
        const i = input as HTMLInputElement;
        const ir = i.getBoundingClientRect();
        const pr = pre.getBoundingClientRect();
        if (ir.width === 0) continue;
        const cs = getComputedStyle(i);
        cx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const textW = cx.measureText(i.value).width;
        const padRight = parseFloat(cs.paddingRight) || 0;
        const firstDigitX = ir.right - padRight - textW;
        gaps.push({ value: i.value, label: (wrap.closest('label,div')?.textContent ?? '').trim().slice(0, 28), prefixRight: Math.round(pr.right * 10) / 10, firstDigitX: Math.round(firstDigitX * 10) / 10, gap: Math.round((firstDigitX - pr.right) * 10) / 10 });
      }
      // salt okunur MoneyCell örnekleri
      const readonlyMoney = [...document.querySelectorAll('span,td,div')].filter((n) => n.children.length === 0 && /^₺[\d.,]+$/.test((n.textContent ?? '').trim())).slice(0, 6).map((n) => ({ text: (n.textContent ?? '').trim(), fvn: getComputedStyle(n).fontVariantNumeric }));
      // Fire % görünür işareti
      const fireMarks = [...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && /^(Fire\s*%?|%)$/.test((n.textContent ?? '').trim())).map((n) => { const r = n.getBoundingClientRect(); const sr = (n as HTMLElement).className?.toString?.().includes('sr-only'); return { text: (n.textContent ?? '').trim(), w: Math.round(r.width), h: Math.round(r.height), srOnly: !!sr }; });
      return { solidAccentCount: solid.length, solid, gaps, readonlyMoney, fireMarks };
    });
    await ctx.close();
  }

  // --- Board ---
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
    out[`board_${vp.width}`] = await page.evaluate(() => {
      const solid: string[] = [];
      for (const b of [...document.querySelectorAll('button, a[data-slot="button"]')]) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const bg = getComputedStyle(b).backgroundColor;
        const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
        if (rgb) { const g = Number(rgb[2]); if (g > Number(rgb[1]) + 25 && g > Number(rgb[3]) + 25) solid.push((b.textContent ?? '').trim().slice(0, 24)); }
      }
      const scroller = [...document.querySelectorAll('main *')].find((e) => e.scrollWidth > e.clientWidth + 4);
      return { solidAccent: solid, innerScroller: scroller ? { cls: (scroller as HTMLElement).className.toString().slice(0, 60), sw: scroller.scrollWidth, cw: scroller.clientWidth } : null };
    });
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });
