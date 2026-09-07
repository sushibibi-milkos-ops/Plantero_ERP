/** Tur 16 kritik ölçümü — arge modülü (salt okuma). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '76e0b20f-4594-4cbf-b9e0-1c21327cb0bd';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // --- A) Liste route'ları ---
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
            text: (n.textContent ?? '').trim(), color: cs.color, fvn: cs.fontVariantNumeric, align: cs.textAlign,
            title: host?.getAttribute('title') ?? null, aria: host?.getAttribute('aria-label') ?? null,
            srOnly: ((n as Element).closest('td,li')?.querySelector('.sr-only')?.textContent ?? null),
          };
        });
        return {
          h1Offset: h1 ? Math.round(h1.getBoundingClientRect().top - mainTop) : null,
          theadOffset: thead ? Math.round(thead.getBoundingClientRect().top - mainTop) : null,
          firstRowViewport: row ? Math.round(row.getBoundingClientRect().top) : null,
          firstRowOffsetInMain: row ? Math.round(row.getBoundingClientRect().top - mainTop) : null,
          rowHeight: row ? Math.round(row.getBoundingClientRect().height * 10) / 10 : null,
          money: moneyInfo,
          hedefKelimesi: /hedef/i.test(main.textContent ?? ''),
          filledAccentButtons: [...document.querySelectorAll('button,a[data-slot="button"]')]
            .filter((b) => { const r = b.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
              const bg = getComputedStyle(b).backgroundColor; return /oklch\(0\.55 0\.16 152/.test(bg) || bg === 'rgb(0, 128, 62)' || /rgb\(0, 1[0-9]{2}, /.test(bg); })
            .map((b) => ({ t: (b.textContent ?? '').trim().slice(0, 24), bg: getComputedStyle(b).backgroundColor, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
        };
      });
      if (vp.width === 1440) {
        const tr = page.locator('tbody tr').first();
        if (await tr.count()) { await tr.hover(); await page.waitForTimeout(200);
          out[`${tag}_hoverBg`] = await tr.evaluate((el) => getComputedStyle(el).backgroundColor); }
        // boş durum
        const search = page.locator('input[aria-label="Tabloda ara"]');
        if (await search.count()) {
          await search.fill('zzzqqq'); await page.waitForTimeout(600);
          out[`${tag}_empty`] = await page.evaluate(() => {
            const m = document.querySelector('main')!;
            return { text: (m.textContent ?? '').replace(/\s+/g, ' ').slice(0, 220), svg: m.querySelectorAll('svg').length };
          });
          await search.fill(''); await page.waitForTimeout(300);
        }
        // gerçek Tab odağı
        await page.locator('body').click({ position: { x: 700, y: 100 } });
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press('Tab');
          const f = await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; if (!el) return null;
            const cs = getComputedStyle(el); return { tag: el.tagName, t: (el.textContent ?? '').trim().slice(0, 20), outline: cs.outline, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 90) }; });
          if (f && (f.tag === 'TR' || f.tag === 'BUTTON')) { out[`${tag}_focus_${f.tag}`] = f; }
        }
      }
      await ctx.close();
    }
  }

  // --- B) Proje reçete atölyesi ---
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    const tag = `precete_${vp.width}`;
    out[tag] = await page.evaluate(() => {
      const vis = [(el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }][0];
      // dolu vurgu buton sayısı
      const filled = [...document.querySelectorAll('button,a[data-slot="button"]')].filter(vis)
        .map((b) => ({ t: (b.textContent ?? '').trim().slice(0, 28), bg: getComputedStyle(b).backgroundColor, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }))
        .filter((b) => /oklch\(0\.55 0\.16 152/.test(b.bg));
      // ₺ öneki ile ilk rakam arası
      const canvas = document.createElement('canvas'); const cx = canvas.getContext('2d')!;
      const gaps: Array<Record<string, unknown>> = [];
      for (const inp of [...document.querySelectorAll('input')].filter(vis)) {
        const parent = inp.parentElement;
        if (!parent) continue;
        const pref = [...parent.querySelectorAll('span,div')].find((s) => (s.textContent ?? '').trim() === '₺' && vis(s));
        if (!pref) continue;
        const cs = getComputedStyle(inp);
        cx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const w = cx.measureText((inp as HTMLInputElement).value).width;
        const ir = inp.getBoundingClientRect();
        const digitX = ir.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) - w;
        gaps.push({ value: (inp as HTMLInputElement).value, prefRight: Math.round(pref.getBoundingClientRect().right * 10) / 10, digitX: Math.round(digitX * 10) / 10, gap: Math.round((digitX - pref.getBoundingClientRect().right) * 10) / 10 });
      }
      // salt okunur para hücreleri
      const readonlyMoney = [...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && /^₺[\d.,]+$/.test((n.textContent ?? '').trim()) && vis(n))
        .map((n) => ({ t: (n.textContent ?? '').trim(), fvn: getComputedStyle(n).fontVariantNumeric, align: getComputedStyle(n).textAlign }));
      // görünür Fire/% işareti
      const fireVisible = [...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && /(Fire|%)/.test((n.textContent ?? '').trim()) && vis(n))
        .map((n) => ({ t: (n.textContent ?? '').trim().slice(0, 20), w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) }));
      const srFire = [...document.querySelectorAll('.sr-only')].map((n) => (n.textContent ?? '').trim()).filter((t) => /fire/i.test(t));
      const sc = document.querySelector('main');
      return { filledAccentCount: filled.length, filled, gaps, readonlyMoney, fireVisible, srFire,
        hedefText: /hedef/i.test(sc?.textContent ?? '') };
    });
    await ctx.close();
  }

  // --- C) Board ---
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
    out[`board_${vp.width}`] = await page.evaluate(() => {
      const scrollers = [...document.querySelectorAll('main *')].filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => ({ sel: el.className.toString().slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth }));
      const filled = [...document.querySelectorAll('button,a[data-slot="button"]')]
        .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && /oklch\(0\.55 0\.16 152/.test(getComputedStyle(b).backgroundColor); })
        .map((b) => (b.textContent ?? '').trim().slice(0, 20));
      return { scrollers, filledAccent: filled };
    });
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });
