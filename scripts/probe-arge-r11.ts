/** Tur 11 kritik ölçümü — arge modülü (salt okuma). İç fonksiyon ATAMASI yok (tsx keepNames → __name hatası). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '75d786b3-35db-4191-b19e-8c77aa84bba5';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  for (const pair of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']]) {
    const key = pair[0]!;
    const route = pair[1]!;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    out[key + '_offset'] = await page.evaluate(() => {
      const main = document.querySelector('main');
      const row = document.querySelector('tbody tr');
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
      };
    });
    out[key + '_money'] = await page.evaluate(() => {
      const res: unknown[] = [];
      for (const td of [...document.querySelectorAll('tbody tr td')]) {
        const txt = (td.textContent ?? '').trim();
        if (!txt.includes('₺')) continue;
        const inner = (td.querySelector('span,div') ?? td) as HTMLElement;
        const cs = getComputedStyle(inner);
        res.push({ t: txt, color: cs.color, fvn: cs.fontVariantNumeric, align: getComputedStyle(td).textAlign, title: inner.getAttribute('title'), aria: inner.getAttribute('aria-label') });
      }
      return res;
    });
    if (key === 'projeler') {
      const rest = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr')!).backgroundColor);
      await page.hover('tbody tr');
      await page.waitForTimeout(250);
      const hover = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr')!).backgroundColor);
      await page.evaluate(() => (document.querySelector('tbody tr') as HTMLElement).focus());
      await page.waitForTimeout(120);
      const focus = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('tbody tr')!);
        return { outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 80) };
      });
      out.projeler_rowFeedback = { rest, hover, focus };
    }
    await ctx.close();
  }

  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/projeler/' + PID + '/receteler', as: 'admin' });
    await page.waitForTimeout(500);
    out['precete_' + vp.width] = await page.evaluate(() => {
      const res: Record<string, unknown> = {};
      const prefixRows: unknown[] = [];
      for (const s of [...document.querySelectorAll('span')]) {
        if ((s.textContent ?? '').trim() !== '₺') continue;
        if (getComputedStyle(s).position !== 'absolute') continue;
        const wrap = s.parentElement!;
        const input = wrap.querySelector('input') as HTMLInputElement | null;
        const pr = s.getBoundingClientRect();
        if (!input) { prefixRows.push({ noInput: true }); continue; }
        const cs = getComputedStyle(input);
        const cv = document.createElement('canvas').getContext('2d')!;
        cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const w = cv.measureText(input.value).width;
        const ir = input.getBoundingClientRect();
        const textLeft = ir.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth || '0') - w;
        prefixRows.push({ value: input.value, gap: Math.round((textLeft - pr.right) * 10) / 10, inputW: Math.round(ir.width) });
      }
      res.prefixRows = prefixRows;
      const rowAlign: unknown[] = [];
      for (const r of [...document.querySelectorAll('[role="row"]')]) {
        const src = r.querySelector('[data-slot="select-trigger"]') as HTMLElement | null;
        if (!src) continue;
        let moneyEl: HTMLElement | null = null;
        for (const el of [...r.querySelectorAll('*')]) {
          if (el.children.length === 0 && /^₺[\d.,]+$/.test((el.textContent ?? '').trim())) { moneyEl = el as HTMLElement; break; }
        }
        const inp = r.querySelector('input[inputmode="decimal"][class*="pl-"]') as HTMLElement | null;
        const target = moneyEl ?? inp;
        const sr = src.getBoundingClientRect();
        const tr2 = target ? target.getBoundingClientRect() : null;
        rowAlign.push({
          name: ((r.querySelector('[data-slot="popover-trigger"]')?.textContent ?? '').trim()).slice(0, 18),
          cySrc: Math.round(sr.top + sr.height / 2),
          cyMoney: tr2 ? Math.round(tr2.top + tr2.height / 2) : null,
          delta: tr2 ? Math.abs(Math.round(sr.top + sr.height / 2) - Math.round(tr2.top + tr2.height / 2)) : null,
          moneyText: target ? (target.textContent ?? (target as HTMLInputElement).value ?? '').trim() : null,
        });
      }
      res.rowAlign = rowAlign;
      const borders: unknown[] = [];
      for (const el of [...document.querySelectorAll('[data-slot="popover-trigger"], [data-slot="select-trigger"], input[inputmode="decimal"]')]) {
        const cs = getComputedStyle(el);
        borders.push({ label: ((el.textContent ?? '') || (el as HTMLInputElement).value || '').trim().slice(0, 14), bw: cs.borderTopWidth, bc: cs.borderTopColor, shadow: cs.boxShadow.slice(0, 50) });
      }
      res.restBorders = borders;
      res.doc = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
      return res;
    });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });
