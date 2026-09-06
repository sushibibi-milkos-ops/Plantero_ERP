/** Tur 2 kritik ölçümü — Ar-Ge modülü. Çıktı: tek satır JSON (stdout). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '3decd113-2b89-4d42-a150-5079cb2c1651';
const base = defaultBaseUrl();

async function ctx(browser: any, w: number, h: number, route: string) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await c.newPage();
  await openRoute(page, { route, as: 'admin', base });
  return { c, page };
}

async function main() {
  const browser = await launchBrowser();
  const out: any = {};

  // ---- BOARD 1440 ----
  {
    const { c, page } = await ctx(browser, 1440, 900, `/arge/projeler/${PID}/board`);
    out.board1440 = await page.evaluate(() => {
      const cols = Array.from(document.querySelectorAll('div.w-64.shrink-0')) as HTMLElement[];
      const data = cols.map((col) => {
        const body = col.querySelector(':scope > div:nth-child(2)') as HTMLElement | null;
        const cards = Array.from(body?.querySelectorAll(':scope > * > button, :scope > button') ?? []) as HTMLElement[];
        const addBtn = col.querySelector('button[data-slot="button"]') as HTMLElement | null;
        const lastCard = cards[cards.length - 1];
        return {
          name: (col.querySelector('span.flex-1') as HTMLElement)?.innerText,
          colH: Math.round(col.getBoundingClientRect().height),
          bodyH: Math.round(body?.getBoundingClientRect().height ?? 0),
          cards: cards.length,
          cardsH: Math.round(cards.reduce((s, e) => s + e.getBoundingClientRect().height, 0)),
          gapLastCardToAdd: lastCard && addBtn ? Math.round(addBtn.getBoundingClientRect().top - lastCard.getBoundingClientRect().bottom) : null,
        };
      });
      const scroller = document.querySelector('.snap-x') as HTMLElement;
      const mininav = document.querySelector('.scrollbar-thin.mb-2') as HTMLElement;
      const first = document.querySelector('main') as HTMLElement;
      return {
        columns: data,
        scroller: scroller ? { h: Math.round(scroller.getBoundingClientRect().height), top: Math.round(scroller.getBoundingClientRect().top), scrollW: scroller.scrollWidth, clientW: scroller.clientWidth, bottom: Math.round(scroller.getBoundingClientRect().bottom) } : null,
        mininavCount: mininav ? mininav.children.length : 0,
        viewportH: window.innerHeight,
        deadBelowScroller: scroller ? Math.round(window.innerHeight - scroller.getBoundingClientRect().bottom) : null,
        mainScrollH: first?.scrollHeight,
      };
    });
    await c.close();
  }

  // ---- BOARD 390 ----
  {
    const { c, page } = await ctx(browser, 390, 844, `/arge/projeler/${PID}/board`);
    out.board390 = await page.evaluate(() => {
      const scroller = document.querySelector('.snap-x') as HTMLElement;
      const nav = document.querySelector('nav.fixed, [class*="fixed"][class*="bottom-0"]') as HTMLElement | null;
      const navs = Array.from(document.querySelectorAll('nav')).map((n) => ({ cls: n.className.slice(0, 60), rect: n.getBoundingClientRect() })).filter((n) => n.rect.bottom > window.innerHeight - 120 && n.rect.height > 30);
      const addBtns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.trim() === 'Kart ekle') as HTMLElement[];
      const r = scroller?.getBoundingClientRect();
      const bottomNavTop = navs.length ? Math.round(navs[0]!.rect.top) : null;
      return {
        viewportH: window.innerHeight,
        scroller: r ? { top: Math.round(r.top), h: Math.round(r.height), bottom: Math.round(r.bottom) } : null,
        bottomNavTop,
        addBtnRects: addBtns.slice(0, 2).map((b) => ({ top: Math.round(b.getBoundingClientRect().top), h: Math.round(b.getBoundingClientRect().height) })),
        addBtnHiddenUnderNav: bottomNavTop != null && addBtns.length > 0 ? addBtns[0]!.getBoundingClientRect().top > bottomNavTop : null,
        docScrollH: document.documentElement.scrollHeight,
        firstColumnCards: (document.querySelector('div.w-64.shrink-0 > div:nth-child(2)') as HTMLElement)?.querySelectorAll('button').length ?? 0,
        headerToBoard: Math.round(r?.top ?? 0),
      };
    });
    await c.close();
  }

  // ---- PROJE REÇETELERİ 1440, v1 (editable) ----
  {
    const { c, page } = await ctx(browser, 1440, 900, `/arge/projeler/${PID}/receteler`);
    out.precete1440_v2 = await page.evaluate(() => {
      const bar = document.querySelector('div.h-1 > div') as HTMLElement | null;
      const track = document.querySelector('div.h-1') as HTMLElement | null;
      const delta = Array.from(document.querySelectorAll('p')).find((p) => p.textContent?.includes("e göre fark"));
      const deltaSpan = delta?.querySelector('span') as HTMLElement | null;
      const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
      const bordered = Array.from(document.querySelectorAll('tbody input, tbody button[data-slot="select-trigger"], tbody [data-slot="combobox"]')).filter((e) => {
        const s = getComputedStyle(e as HTMLElement);
        return s.borderTopWidth !== '0px' && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.borderTopColor);
      }).length;
      const clipped = Array.from(document.querySelectorAll('input')).filter((i) => (i as HTMLInputElement).scrollWidth > (i as HTMLInputElement).clientWidth + 1).map((i) => ({ v: (i as HTMLInputElement).value, sw: (i as HTMLInputElement).scrollWidth, cw: (i as HTMLInputElement).clientWidth }));
      const qtyCells = Array.from(document.querySelectorAll('tbody tr')).map((tr) => (tr.children[1] as HTMLElement)?.innerText?.trim());
      return {
        trackH: track ? Math.round(track.getBoundingClientRect().height) : null,
        barW: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        trackW: track ? Math.round(track.getBoundingClientRect().width) : null,
        barBg: bar ? getComputedStyle(bar).backgroundColor : null,
        deltaText: delta?.innerText,
        deltaColor: deltaSpan ? getComputedStyle(deltaSpan).color : null,
        rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
        borderedControlsInTable: bordered,
        clippedInputs: clipped,
        qtyCells,
      };
    });
    // v1'e geç (editable)
    const v1 = page.locator('button', { hasText: /^v1/ }).first();
    if (await v1.count()) {
      await v1.click();
      await page.waitForTimeout(900);
      out.precete1440_v1 = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
        const controls = Array.from(document.querySelectorAll('tbody input, tbody button[data-slot="select-trigger"], tbody button[role="combobox"], tbody [role="combobox"]')) as HTMLElement[];
        const bordered = controls.filter((e) => {
          const s = getComputedStyle(e);
          return parseFloat(s.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)/.test(s.borderTopColor);
        }).length;
        const clipped = Array.from(document.querySelectorAll('input')).filter((i) => (i as HTMLInputElement).scrollWidth > (i as HTMLInputElement).clientWidth + 1).map((i) => ({ v: (i as HTMLInputElement).value, sw: (i as HTMLInputElement).scrollWidth, cw: (i as HTMLInputElement).clientWidth }));
        return { rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)), controlsCount: controls.length, borderedControlsInTable: bordered, clippedInputs: clipped, controlHeights: controls.map((c) => Math.round(c.getBoundingClientRect().height)) };
      });
    }
    await c.close();
  }

  // ---- PROJE REÇETELERİ 390 ----
  {
    const { c, page } = await ctx(browser, 390, 844, `/arge/projeler/${PID}/receteler`);
    out.precete390 = await page.evaluate(() => {
      const wrap = document.querySelector('.overflow-x-auto.rounded-lg') as HTMLElement | null;
      const inputs = Array.from(document.querySelectorAll('input, button[data-slot="select-trigger"]')) as HTMLElement[];
      return {
        tableWrap: wrap ? { scrollW: wrap.scrollWidth, clientW: wrap.clientWidth } : null,
        controlHeights: Array.from(new Set(inputs.map((i) => Math.round(i.getBoundingClientRect().height)))),
        controlsBelow44: inputs.filter((i) => i.getBoundingClientRect().height < 44).length,
        badgeAktif: (() => { const b = Array.from(document.querySelectorAll('span')).find((s) => s.textContent?.trim() === 'Aktif'); return b ? { w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) } : null; })(),
      };
    });
    await c.close();
  }

  // ---- /arge/receteler 390: mobil kart meta metni ----
  {
    const { c, page } = await ctx(browser, 390, 844, '/arge/receteler');
    out.receteler390 = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('ul li')) as HTMLElement[];
      return { cardTexts: items.slice(0, 3).map((i) => i.innerText.replace(/\n/g, ' | ')), rawHtml: items[0]?.innerHTML.slice(0, 400) };
    });
    await c.close();
  }

  // ---- /arge/projeler 1440 + 390 başlık yüksekliği ----
  for (const [k, w, h] of [['projeler1440', 1440, 900], ['projeler390', 390, 844]] as const) {
    const { c, page } = await ctx(browser, w as number, h as number, '/arge/projeler');
    out[k] = await page.evaluate(() => {
      const firstRow = document.querySelector('tbody tr, ul li') as HTMLElement | null;
      const h1 = document.querySelector('h1') as HTMLElement | null;
      const toggles = Array.from(document.querySelectorAll('button[aria-label$="görünümü"]')).map((b) => { const r = b.getBoundingClientRect(); return { l: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) }; });
      return {
        h1Top: h1 ? Math.round(h1.getBoundingClientRect().top) : null,
        firstRowTop: firstRow ? Math.round(firstRow.getBoundingClientRect().top) : null,
        toggles,
      };
    });
    await c.close();
  }

  // ---- /arge/receteler 1440 başlık ----
  {
    const { c, page } = await ctx(browser, 1440, 900, '/arge/receteler');
    out.receteler1440 = await page.evaluate(() => {
      const firstRow = document.querySelector('tbody tr') as HTMLElement | null;
      return { firstRowTop: firstRow ? Math.round(firstRow.getBoundingClientRect().top) : null };
    });
    await c.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
