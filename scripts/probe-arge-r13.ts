/** Tur 13 kritik ölçümü — arge modülü (salt okuma). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '9380c23c-1a10-43bc-a879-b98acc2e4cde';
const base = defaultBaseUrl();

const SOLID_ACCENT = `(() => {
  const res = [];
  for (const b of [...document.querySelectorAll('button, a[data-slot="button"]')]) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const bg = getComputedStyle(b).backgroundColor;
    const m = /oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/.exec(bg);
    let green = false;
    if (m) green = Number(m[2]) > 0.08 && Number(m[3]) > 120 && Number(m[3]) < 190;
    const rgb = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(bg);
    if (rgb) { const g = Number(rgb[2]); green = g > Number(rgb[1]) + 25 && g > Number(rgb[3]) + 25; }
    if (green) res.push({ text: (b.textContent ?? '').trim().slice(0, 30) || b.getAttribute('aria-label'), bg, w: Math.round(r.width), h: Math.round(r.height) });
  }
  return res;
})()`;

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) Liste route'ları
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
          rowHeight: Math.round(r.height * 10) / 10,
          h1Top_mainOffset: h1 ? Math.round(h1.getBoundingClientRect().top - m.top) : null,
          theadTop_mainOffset: thead ? Math.round(thead.getBoundingClientRect().top - m.top) : null,
          theadBg: thead?.querySelector('th') ? getComputedStyle(thead.querySelector('th')!).backgroundColor : null,
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
            res.push({
              t: txt,
              color: cs.color,
              fvn: cs.fontVariantNumeric,
              align: getComputedStyle(td).textAlign,
              title: inner.getAttribute('title') ?? td.getAttribute('title'),
              aria: inner.getAttribute('aria-label') ?? td.getAttribute('aria-label'),
              srOnly: [...td.querySelectorAll('.sr-only')].map((e) => (e.textContent ?? '').trim()),
            });
          }
          return res;
        });
        out[tag + '_hedefKelimesi'] = await page.evaluate(() => (document.querySelector('main')?.textContent ?? '').toLowerCase().includes('hedef'));
        // th/td sağ kenar hizası
        out[tag + '_edges'] = await page.evaluate(() => {
          const ths = [...document.querySelectorAll('thead th')];
          const first = [...document.querySelectorAll('tbody tr')][0];
          if (!first) return null;
          const tds = [...first.querySelectorAll('td')];
          return ths.map((th, i) => ({
            h: (th.textContent ?? '').trim().slice(0, 14),
            thRight: Math.round(th.getBoundingClientRect().right),
            tdRight: tds[i] ? Math.round(tds[i]!.getBoundingClientRect().right) : null,
          }));
        });
        // satır hover + focus
        const firstRow = page.locator('tbody tr').first();
        await firstRow.hover();
        out[tag + '_rowHover'] = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr')!).backgroundColor);
        await page.mouse.move(5, 5);
        out[tag + '_rowRest'] = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr')!).backgroundColor);
        out[tag + '_rowFocus'] = await page.evaluate(() => {
          const tr = document.querySelector('tbody tr') as HTMLElement;
          tr.focus();
          const cs = getComputedStyle(tr);
          return { tabindex: tr.getAttribute('tabindex'), outline: cs.outlineColor + ' ' + cs.outlineStyle + ' ' + cs.outlineWidth };
        });
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
    out[tag + '_solidGreen'] = await page.evaluate(SOLID_ACCENT);
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
        res.push({
          label: (row?.textContent ?? '').trim().slice(0, 40),
          prefixRight: Math.round(pr.right * 10) / 10,
          firstDigitX: firstDigitX === null ? null : Math.round(firstDigitX * 10) / 10,
          gap: firstDigitX === null ? null : Math.round((firstDigitX - pr.right) * 10) / 10,
          val,
        });
      }
      return res;
    });
    out[tag + '_moneyCells'] = await page.evaluate(() => {
      const res: unknown[] = [];
      for (const e of [...document.querySelectorAll('main *')]) {
        const txt = (e.textContent ?? '').trim();
        if (!/^₺[\d.,]+$/.test(txt)) continue;
        if (e.children.length > 0) continue;
        const cs = getComputedStyle(e);
        res.push({ t: txt, fvn: cs.fontVariantNumeric, size: cs.fontSize });
      }
      return res.slice(0, 12);
    });
    if (vp.width === 390) {
      out[tag + '_mobilFire'] = await page.evaluate(() => {
        const res: unknown[] = [];
        for (const inp of [...document.querySelectorAll('main input')] as HTMLInputElement[]) {
          const r = inp.getBoundingClientRect();
          if (r.width === 0) continue;
          res.push({ v: inp.value, aria: inp.getAttribute('aria-label'), title: inp.getAttribute('title'), ph: inp.getAttribute('placeholder'), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) });
        }
        return res;
      });
      out[tag + '_gorunurFire'] = await page.evaluate(() => {
        const hits: string[] = [];
        for (const e of [...document.querySelectorAll('main *')]) {
          if (e.children.length > 0) continue;
          const txt = (e.textContent ?? '').trim();
          if (!txt) continue;
          const cs = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.classList.contains('sr-only');
          if (visible && /fire|%$/i.test(txt)) hits.push(txt.slice(0, 24));
        }
        return hits;
      });
    }
    await ctx.close();
  }

  // 3) Board
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
    const tag = 'board_' + vp.width;
    out[tag + '_scroller'] = await page.evaluate(() => {
      const els = [...document.querySelectorAll('main *')].filter((e) => e.scrollWidth > e.clientWidth + 1);
      return els.slice(0, 4).map((e) => ({ tag: e.tagName, cls: (e.className ?? '').toString().slice(0, 70), sw: e.scrollWidth, cw: e.clientWidth }));
    });
    out[tag + '_solidGreen'] = await page.evaluate(SOLID_ACCENT);
    if (vp.width === 1440) {
      out[tag + '_cardFocus'] = await page.evaluate(() => {
        const card = document.querySelector('[data-rnd-card], article, li[tabindex], [role="button"][draggable], main [tabindex="0"]') as HTMLElement | null;
        if (!card) return null;
        card.focus();
        const cs = getComputedStyle(card);
        return { sel: card.tagName + '.' + (card.className ?? '').toString().slice(0, 40), outline: cs.outlineColor + ' ' + cs.outlineStyle + ' ' + cs.outlineWidth };
      });
    }
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
