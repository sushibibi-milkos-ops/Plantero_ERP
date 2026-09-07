/**
 * Tur 8 — arge modülü kritik ölçümleri (gorsel-critic).
 * Çıktı: artifacts/critic/probe-arge-r8.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const PID = process.env.PID ?? '731afc49-b499-4e9d-b1fc-1d9d8510b4f2';
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

  // --- /arge/projeler 1440: ilk satır ofseti + birim maliyet renkleri
  {
    const { page, ctx } = await open('/arge/projeler', 1440, 900);
    out.projeler_1440 = await page.evaluate(() => {
      const main = document.querySelector('main');
      const mainTop = main?.getBoundingClientRect().top ?? 0;
      const firstRow = document.querySelector('tbody tr');
      const r = firstRow?.getBoundingClientRect();
      const cells = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return tds.map((td) => ({ t: (td.textContent ?? '').trim(), color: getComputedStyle(td.firstElementChild ?? td).color }));
      });
      const th = Array.from(document.querySelectorAll('thead th')).map((e) => ({
        t: (e.textContent ?? '').trim(),
        right: +e.getBoundingClientRect().right.toFixed(1),
        align: getComputedStyle(e).textAlign,
      }));
      const tdRights = Array.from(document.querySelectorAll('tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => +td.getBoundingClientRect().right.toFixed(1)),
      );
      return {
        firstRowTop_viewport: r ? +r.top.toFixed(1) : null,
        firstRowTop_mainOffset: r ? +(r.top - mainTop).toFixed(1) : null,
        rowHeight: r ? +r.height.toFixed(1) : null,
        th,
        tdRights,
        birimMaliyet: cells.map((c) => c[4]),
      };
    });
    await ctx.close();
  }

  // --- /arge/receteler 1440: ilk satır ofseti + birim maliyet rengi
  {
    const { page, ctx } = await open('/arge/receteler', 1440, 900);
    out.receteler_1440 = await page.evaluate(() => {
      const main = document.querySelector('main');
      const mainTop = main?.getBoundingClientRect().top ?? 0;
      const firstRow = document.querySelector('tbody tr');
      const r = firstRow?.getBoundingClientRect();
      const rows = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return tds.map((td) => {
          const leaf = td.querySelector('span,div') ?? td;
          return { t: (td.textContent ?? '').trim(), color: getComputedStyle(leaf).color, right: +td.getBoundingClientRect().right.toFixed(1) };
        });
      });
      const th = Array.from(document.querySelectorAll('thead th')).map((e) => ({
        t: (e.textContent ?? '').trim(),
        right: +e.getBoundingClientRect().right.toFixed(1),
      }));
      return { firstRowTop_viewport: r ? +r.top.toFixed(1) : null, firstRowTop_mainOffset: r ? +(r.top - mainTop).toFixed(1) : null, th, rows };
    });
    await ctx.close();
  }

  // --- proje reçeteleri 1440: sütun hizası, kırpma, çerçeve sayımı
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/receteler`, 1440, 900);
    out.precete_1440 = await page.evaluate(() => {
      const card = document.querySelector('main [class*="rounded-xl"]');
      const table = document.querySelector('[role="table"]');
      const rowsEls = Array.from(document.querySelectorAll('[role="row"]'));
      const headerCells = Array.from(document.querySelectorAll('[role="columnheader"]')).map((e) => ({
        t: (e.textContent ?? '').trim(),
        left: +e.getBoundingClientRect().left.toFixed(1),
        right: +e.getBoundingClientRect().right.toFixed(1),
        w: +e.getBoundingClientRect().width.toFixed(1),
        align: getComputedStyle(e).textAlign,
      }));
      const bodyRows = rowsEls.slice(1).map((r) => {
        const cells = Array.from(r.querySelectorAll('[role="cell"], [role="gridcell"]'));
        return {
          h: +r.getBoundingClientRect().height.toFixed(1),
          cells: cells.map((c) => {
            const rect = c.getBoundingClientRect();
            // en sağdaki metin düğümünün sağ kenarı
            const span = Array.from(c.querySelectorAll('span,div')).filter((s) => (s.textContent ?? '').trim().length);
            const last = span.length ? span[span.length - 1]! : c;
            const lr = last.getBoundingClientRect();
            return {
              t: (c.textContent ?? '').trim().slice(0, 24),
              right: +rect.right.toFixed(1),
              textRight: +lr.right.toFixed(1),
              align: getComputedStyle(c).textAlign,
            };
          }),
        };
      });
      // ürün adı kırpma
      const nameSpans = Array.from(document.querySelectorAll('[role="row"] [data-testid="line-product-name"], [role="row"] span'))
        .filter((s) => (s as HTMLElement).classList.contains('truncate'))
        .map((s) => ({ t: (s.textContent ?? '').trim(), cw: (s as HTMLElement).clientWidth, sw: (s as HTMLElement).scrollWidth }));
      // görünür kutu sayımı (dört tarafı kenarlıklı)
      const boxes: Array<{ tag: string; cls: string; w: number; h: number }> = [];
      if (card) {
        for (const el of Array.from(card.querySelectorAll('*'))) {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 16) continue;
          const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
          const visible = bw.every((v) => v > 0) && cs.borderTopStyle !== 'none' && !/rgba\(.*, 0\)/.test(cs.borderTopColor);
          if (visible) boxes.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), w: +r.width.toFixed(0), h: +r.height.toFixed(0) });
        }
      }
      const cardRect = card?.getBoundingClientRect();
      return {
        cardClass: (card?.className || '').toString().slice(0, 120),
        cardRect: cardRect ? { w: +cardRect.width.toFixed(1), h: +cardRect.height.toFixed(1) } : null,
        tableClass: (table?.className || '').toString(),
        headerCells,
        bodyRows,
        nameSpans,
        borderedBoxCount: boxes.length,
        borderedBoxes: boxes,
        docScrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
      };
    });
    await ctx.close();
  }

  // --- proje reçeteleri 390
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/receteler`, 390, 844);
    out.precete_390 = await page.evaluate(() => {
      const trig = document.querySelector('[data-slot="select-trigger"]');
      const span = trig?.querySelector('span');
      const rows = Array.from(document.querySelectorAll('main ul > li, main [data-slot="mobile-row"]')).map((r) => ({
        t: (r.textContent ?? '').trim().slice(0, 30),
        h: +r.getBoundingClientRect().height.toFixed(1),
      }));
      return {
        selectTrigger: trig
          ? { w: +trig.getBoundingClientRect().width.toFixed(1), h: +trig.getBoundingClientRect().height.toFixed(1), text: (trig.textContent ?? '').trim(), spanCw: (span as HTMLElement)?.clientWidth, spanSw: (span as HTMLElement)?.scrollWidth }
          : null,
        rows,
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
        docScrollH: document.documentElement.scrollHeight,
        nativeSelects: document.querySelectorAll('main select').length,
      };
    });
    await ctx.close();
  }

  // --- board 1440: kolon şeridi taşma/fade
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/board`, 1440, 900);
    out.board_1440 = await page.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll('main *')).filter((e) => {
        const el = e as HTMLElement;
        return el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'visible';
      }) as HTMLElement[];
      const cols = Array.from(document.querySelectorAll('[data-slot="board-column"], main [class*="w-"][class*="shrink-0"]')).slice(0, 10);
      return {
        scrollers: scrollers.map((s) => ({
          cls: (s.className || '').toString().slice(0, 90),
          sw: s.scrollWidth,
          cw: s.clientWidth,
          maskImage: getComputedStyle(s).maskImage?.slice(0, 40),
        })),
        columnCount: document.querySelectorAll('[data-slot="board-column"]').length,
        colRects: cols.map((c) => ({ w: +c.getBoundingClientRect().width.toFixed(0), right: +c.getBoundingClientRect().right.toFixed(0) })),
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
      };
    });
    await ctx.close();
  }

  await browser.close();
  writeFileSync('artifacts/critic/probe-arge-r8.json', JSON.stringify(out, null, 1));
  console.log('OK');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
