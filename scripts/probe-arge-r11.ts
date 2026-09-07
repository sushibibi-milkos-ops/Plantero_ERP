/** Tur 11 kritik ölçümü — arge modülü (salt okuma, hiçbir şey değiştirmez). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '75d786b3-35db-4191-b19e-8c77aa84bba5';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) Liste ekranlarında ilk satır dikey ofseti
  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    out[`${key}_offset`] = await page.evaluate(() => {
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
    // satır hover + focus geri bildirimi (yalnız projeler)
    if (key === 'projeler') {
      const rest = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr')!).backgroundColor);
      await page.hover('tbody tr');
      await page.waitForTimeout(250);
      const hover = await page.evaluate(() => getComputedStyle(document.querySelector('tbody tr')!).backgroundColor);
      await page.evaluate(() => (document.querySelector('tbody tr') as HTMLElement).focus());
      await page.waitForTimeout(100);
      const focus = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('tbody tr')!);
        return { outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, boxShadow: cs.boxShadow };
      });
      out.projeler_rowFeedback = { rest, hover, focus };
      // Birim maliyet renkleri + tabular-nums
      out.projeler_money = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('tbody tr td')).filter((td) => /₺/.test(td.textContent ?? ''));
        return cells.map((td) => {
          const el = (td.querySelector('*') ?? td) as HTMLElement;
          const cs = getComputedStyle(el);
          return { t: (td.textContent ?? '').trim(), color: cs.color, fvn: cs.fontVariantNumeric, align: getComputedStyle(td).textAlign, title: (td as HTMLElement).title || el.title || null };
        });
      });
    }
    await ctx.close();
  }

  // 2) Maliyet simülatörü — ₺ öneki boşluğu, dikey hiza, rest kenarlıkları
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    await page.waitForTimeout(400);
    out[`precete_${vp.width}`] = await page.evaluate(() => {
      const res: Record<string, unknown> = {};
      // ₺ öneki ile ilk rakam arası boşluk (manuel satır) + MoneyCell satırları
      const prefixSpans = Array.from(document.querySelectorAll('span')).filter(
        (s) => (s.textContent ?? '').trim() === '₺' && getComputedStyle(s).position === 'absolute',
      );
      res.prefixRows = prefixSpans.map((s) => {
        const wrap = s.parentElement!;
        const input = wrap.querySelector('input') as HTMLInputElement | null;
        const pr = s.getBoundingClientRect();
        if (!input) return { prefixRight: pr.right, input: null };
        // input metninin sağ kenarı = input right - paddingRight; metin genişliğini canvas ile ölç
        const cs = getComputedStyle(input);
        const cv = document.createElement('canvas').getContext('2d')!;
        cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const w = cv.measureText(input.value).width;
        const ir = input.getBoundingClientRect();
        const textLeft = ir.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth || '0') - w;
        return { value: input.value, gapPrefixToFirstDigit: Math.round((textLeft - pr.right) * 10) / 10, prefixRight: Math.round(pr.right), textLeft: Math.round(textLeft) };
      });
      // salt okunur MoneyCell'lerde ₺ ile rakam bitişik mi (tek metin düğümü)
      const moneyCells = Array.from(document.querySelectorAll('[data-slot="money"], .tabular-nums')).map((el) => (el.textContent ?? '').trim()).filter((t) => t.startsWith('₺'));
      res.moneyCellTexts = moneyCells.slice(0, 12);
      // satır içi dikey hiza: B. maliyet vs Maliyet kaynağı
      const rows = Array.from(document.querySelectorAll('[role="row"]')).filter((r) => r.querySelector('[data-slot="select-trigger"], [data-slot="popover-trigger"]'));
      res.rowAlign = rows.map((r) => {
        const src = r.querySelector('[data-slot="select-trigger"]') as HTMLElement | null;
        const moneyEl = Array.from(r.querySelectorAll('*')).find((el) => /^₺[\d.,]+$/.test((el.textContent ?? '').trim()) && el.children.length === 0) as HTMLElement | undefined;
        const inp = r.querySelector('input[inputmode="decimal"]') as HTMLElement | null;
        const cy = (el: Element | null | undefined) => (el ? Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2) : null);
        const target = moneyEl ?? inp;
        return { name: (r.querySelector('[data-slot="popover-trigger"]')?.textContent ?? '').trim().slice(0, 20), cySrc: cy(src), cyMoney: cy(target), delta: src && target ? Math.abs(cy(src)! - cy(target)!) : null };
      });
      // rest kenarlıkları: satır içi kontrollerin border-width'i
      res.restBorders = Array.from(document.querySelectorAll('[data-slot="popover-trigger"], [data-slot="select-trigger"], input[inputmode="decimal"]'))
        .map((el) => {
          const cs = getComputedStyle(el);
          return { tag: el.tagName.toLowerCase(), label: (el.textContent ?? (el as HTMLInputElement).value ?? '').trim().slice(0, 16), bw: cs.borderTopWidth, bc: cs.borderTopColor, shadow: cs.boxShadow.slice(0, 60) };
        });
      // sütun sağ kenarları
      const header = document.querySelector('[role="row"][data-header], [role="row"]');
      res.docScroll = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
      return res;
    });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });
