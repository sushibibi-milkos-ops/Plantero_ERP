/**
 * Tur 9b — arge: mobil eylem şeridi kırpılması, odak halkaları, hover.
 * Çıktı: artifacts/critic/probe-arge-r9b.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const PID = process.env.PID ?? 'c2913daa-05c6-46bc-9f48-942e864a651f';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  const open = async (route: string, w: number, h: number) => {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      isMobile: w < 500,
      hasTouch: w < 500,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
    });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    return { page, ctx };
  };

  // 1) 390px eylem şeridi: her butonun kapsayıcıya göre görünürlüğü
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/receteler`, 390, 844);
    out.actionbar_390 = await page.evaluate(() => {
      const bar = Array.from(document.querySelectorAll('div')).find(
        (e) => e.className.toString().includes('overflow-x-auto') && (e.textContent ?? '').includes('Onaya gönder'),
      ) as HTMLElement | undefined;
      if (!bar) return { found: false };
      const br = bar.getBoundingClientRect();
      const kids = Array.from(bar.querySelectorAll('button, a')).map((b) => {
        const r = b.getBoundingClientRect();
        return {
          label: (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30),
          left: +r.left.toFixed(1),
          right: +r.right.toFixed(1),
          w: +r.width.toFixed(1),
          h: +r.height.toFixed(1),
          hiddenPx: +Math.max(0, r.right - br.right).toFixed(1),
        };
      });
      return {
        found: true,
        bar: { left: +br.left.toFixed(1), right: +br.right.toFixed(1), cw: bar.clientWidth, sw: bar.scrollWidth },
        kids,
      };
    });

    // odak halkası: eylem şeridindeki ilk buton
    out.focus_actionbar = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((e) =>
        (e.getAttribute('aria-label') ?? e.textContent ?? '').includes('Onaya gönder'),
      ) as HTMLElement | undefined;
      if (!b) return null;
      b.focus();
      const cs = getComputedStyle(b);
      return { outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 80) };
    });
    await ctx.close();
  }

  // 2) 1440: reçete satır tablosu anatomisi + odak
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/receteler`, 1440, 900);
    out.pr_1440 = await page.evaluate(() => {
      const main = document.querySelector('main');
      const mainTop = main?.getBoundingClientRect().top ?? 0;
      const rows = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const r = tr.getBoundingClientRect();
        return { h: +r.height.toFixed(1) };
      });
      const first = document.querySelector('tbody tr')?.getBoundingClientRect();
      // tabular-nums kontrolü: para hücreleri
      const money = Array.from(document.querySelectorAll('td, span'))
        .filter((e) => /₺[\d.,]+$/.test((e.textContent ?? '').trim()) && e.children.length === 0)
        .slice(0, 8)
        .map((e) => ({
          t: (e.textContent ?? '').trim(),
          fvn: getComputedStyle(e).fontVariantNumeric,
          align: getComputedStyle(e).textAlign,
        }));
      return {
        rows,
        firstRowTop_mainOffset: first ? +(first.top - mainTop).toFixed(1) : null,
        money,
      };
    });
    // odak halkası: satır sil butonu
    out.focus_pr_1440 = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Satırı sil"]') as HTMLElement | null;
      if (!b) return null;
      b.focus();
      const cs = getComputedStyle(b);
      return { outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 80) };
    });
    await ctx.close();
  }

  // 3) board 1440: kart odağı + hover
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/board`, 1440, 900);
    out.board_card = await page.evaluate(() => {
      const card = document.querySelector('[data-kanban-card], [data-card-id]') as HTMLElement | null;
      const any = card ?? (Array.from(document.querySelectorAll('article, li, div')).find((e) =>
        (e.textContent ?? '').includes('Pazar araştırması'),
      ) as HTMLElement | undefined);
      if (!any) return null;
      const r = any.getBoundingClientRect();
      const cs = getComputedStyle(any);
      return { tag: any.tagName, cls: any.className.toString().slice(0, 120), w: +r.width.toFixed(1), h: +r.height.toFixed(1), tabindex: any.getAttribute('tabindex'), bg: cs.backgroundColor, border: cs.borderColor };
    });
    await ctx.close();
  }

  writeFileSync('artifacts/critic/probe-arge-r9b.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
