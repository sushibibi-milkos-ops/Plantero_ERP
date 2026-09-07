/** Tur 12 kritik ölçümü — arge modülü (salt okuma). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = 'e1794a07-df66-432a-80c9-1b92a08feb38';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) Liste route'ları: ilk satır ofseti + para hücreleri + thead
  for (const pair of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']]) {
    const key = pair[0]!;
    const route = pair[1]!;
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
      const page = await ctx.newPage();
      await openRoute(page, { base, route, as: 'admin' });
      const tag = key + '_' + vp.width;
      out[tag + '_offset'] = await page.evaluate(() => {
        const main = document.querySelector('main');
        const row = document.querySelector('tbody tr') ?? document.querySelector('main ul > li');
        const h1 = document.querySelector('h1');
        const thead = document.querySelector('thead tr');
        if (!main || !row) return null;
        const m = main.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        return {
          firstRowTop_viewport: Math.round(r.top),
          firstRowTop_mainOffset: Math.round(r.top - m.top),
          h1Top_mainOffset: h1 ? Math.round(h1.getBoundingClientRect().top - m.top) : null,
          theadTop_mainOffset: thead ? Math.round(thead.getBoundingClientRect().top - m.top) : null,
          theadBg: thead ? getComputedStyle(thead).backgroundColor : null,
          theadCellBg: thead?.querySelector('th') ? getComputedStyle(thead.querySelector('th')!).backgroundColor : null,
        };
      });
      if (vp.width === 1440) {
        out[tag + '_money'] = await page.evaluate(() => {
          const res: unknown[] = [];
          for (const td of [...document.querySelectorAll('tbody tr td')]) {
            const txt = (td.textContent ?? '').trim();
            if (!txt.includes('₺')) continue;
            const inner = (td.querySelector('span,div') ?? td) as HTMLElement;
            const cs = getComputedStyle(inner);
            res.push({ t: txt, color: cs.color, fvn: cs.fontVariantNumeric, align: getComputedStyle(td).textAlign, title: inner.getAttribute('title') ?? td.getAttribute('title'), aria: inner.getAttribute('aria-label') ?? td.getAttribute('aria-label') });
          }
          return res;
        });
        out[tag + '_hedefKelimesi'] = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').toLowerCase().includes('hedef'));
        // dolu vurgu buton sayısı
        out[tag + '_solidAccent'] = await page.evaluate(() => [...document.querySelectorAll('button,a[data-slot=button]')]
          .filter((b) => { const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && /oklch\(0\.5[0-9]/.test(cs.backgroundColor.replace(/\s/g, '')) === false && cs.backgroundColor.includes('rgb') && false; })
          .map((b) => b.textContent));
      }
      await ctx.close();
    }
  }

  // 2) Reçete atölyesi
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    const tag = 'recete_' + vp.width;
    // dolu vurgu (yeşil) buton sayısı
    out[tag + '_solidGreen'] = await page.evaluate(() => {
      const res: unknown[] = [];
      for (const b of [...document.querySelectorAll('button, a[data-slot="button"]')]) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const bg = getComputedStyle(b).backgroundColor;
        const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(bg);
        let green = false;
        if (m) green = Number(m[2]) > 0.08 && Number(m[3]) > 120 && Number(m[3]) < 190;
        const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
        if (rgb) { const g = Number(rgb[2]); green = g > Number(rgb[1]) + 25 && g > Number(rgb[3]) + 25; }
        if (green) res.push({ text: (b.textContent ?? '').trim().slice(0, 30) || b.getAttribute('aria-label'), bg, w: Math.round(r.width), h: Math.round(r.height) });
      }
      return res;
    });
    // ₺ öneki ile ilk rakam arası mesafe (Birim maliyet sütunu)
    out[tag + '_prefixGap'] = await page.evaluate(() => {
      const res: unknown[] = [];
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) nodes.push(n as Text);
      for (const t of nodes) {
        const s = (t.textContent ?? '').trim();
        if (s !== '₺') continue;
        const range = document.createRange();
        range.selectNode(t);
        const pr = range.getBoundingClientRect();
        // aynı satırdaki sağdaki input/metin
        const parent = t.parentElement!;
        const row = parent.closest('div');
        const input = row?.querySelector('input') as HTMLInputElement | null;
        let firstDigitX: number | null = null;
        let val: string | null = null;
        if (input) {
          val = input.value;
          const cs = getComputedStyle(input);
          const c = document.createElement('canvas').getContext('2d')!;
          c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const w = c.measureText(input.value).width;
          const ir = input.getBoundingClientRect();
          firstDigitX = ir.right - parseFloat(cs.paddingRight) - w;
        }
        res.push({ label: (row?.textContent ?? '').trim().slice(0, 40), prefixRight: Math.round(pr.right * 10) / 10, firstDigitX: firstDigitX === null ? null : Math.round(firstDigitX * 10) / 10, gap: firstDigitX === null ? null : Math.round((firstDigitX - pr.right) * 10) / 10, val });
      }
      return res;
    });
    if (vp.width === 390) {
      // mobil satırda etiketsiz sayı (fire %) var mı
      out[tag + '_mobilFire'] = await page.evaluate(() => {
        const res: unknown[] = [];
        for (const inp of [...document.querySelectorAll('main input')] as HTMLInputElement[]) {
          const r = inp.getBoundingClientRect();
          if (r.width === 0) continue;
          res.push({ v: inp.value, aria: inp.getAttribute('aria-label'), title: inp.getAttribute('title'), ph: inp.getAttribute('placeholder'), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) });
        }
        return res;
      });
    }
    await ctx.close();
  }

  // 3) Board: kolon scroll ve hover/focus
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
  out.board_scroller = await page.evaluate(() => {
    const els = [...document.querySelectorAll('main *')].filter((e) => e.scrollWidth > e.clientWidth + 1);
    return els.slice(0, 4).map((e) => ({ tag: e.tagName, cls: (e.className ?? '').toString().slice(0, 70), sw: e.scrollWidth, cw: e.clientWidth }));
  });
  await ctx.close();

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
