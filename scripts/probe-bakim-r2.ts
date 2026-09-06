/**
 * Tur 2 — bakım modülü ölçüm probu (docs/DESIGN-SCORECARD.md kural 1/6).
 * Açık bulguları yeniden ölçer: iç kap taşması, KPI/tablo geometrisi, ilk ekran satır sayısı,
 * sıfır değer rengi, boş alan, kanban metrikleri, sekme çubuğu, iskelet-gerçek fark.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const out: Record<string, unknown> = {};

  // iç kap yatay taşmaları (main altındaki her kap)
  const overflows: unknown[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('main, main *'))) {
    if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 100) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'visible') continue;
      overflows.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 120),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        overflowX: cs.overflowX,
        text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 60),
      });
    }
  }
  out.overflows = overflows;

  // tablo genişliği: <table> gerçek genişliği vs kabı
  const table = document.querySelector<HTMLElement>('main table');
  if (table) {
    const holder = table.parentElement as HTMLElement | null;
    out.table = {
      tableWidth: Math.round(table.getBoundingClientRect().width),
      tableScrollWidth: table.scrollWidth,
      holderClientWidth: holder ? holder.clientWidth : null,
      holderScrollWidth: holder ? holder.scrollWidth : null,
      top: Math.round(table.getBoundingClientRect().top + window.scrollY),
      headerCells: Array.from(table.querySelectorAll('thead th')).map((th) => ({
        t: (th.textContent || '').trim().slice(0, 16),
        w: Math.round(th.getBoundingClientRect().width),
        right: Math.round(th.getBoundingClientRect().right),
        clipped: th.scrollWidth - th.clientWidth > 1,
      })),
    };
    // ilk ekranda görünen satır sayısı
    const rows = Array.from(table.querySelectorAll<HTMLElement>('tbody tr'));
    out.rowsAboveFold = rows.filter((tr) => tr.getBoundingClientRect().bottom <= window.innerHeight).length;
    out.rowCount = rows.length;
  }

  // KPI kartları: 19px (strip) veya 22px (card) tabular-nums değer düğümünün en yakın kutusu
  const kpiSet = new Set<HTMLElement>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs === 22 || fs === 19) {
      const box = (el.closest('a, [class*="rounded"]') as HTMLElement | null) ?? el.parentElement;
      const outer = (box?.parentElement?.children.length ?? 0) > 1 && box ? box : (box ?? el);
      kpiSet.add(outer);
    }
  }
  out.kpi = Array.from(kpiSet).map((el) => ({
    h: Math.round(el.getBoundingClientRect().height),
    w: Math.round(el.getBoundingClientRect().width),
    right: Math.round(el.getBoundingClientRect().right),
    clippedRight: el.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
    text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 40),
  }));

  // içerik alt kenarı / boş alan
  const main = document.querySelector('main');
  let lastBottom = 0;
  if (main)
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.width > 0 && r.bottom + window.scrollY > lastBottom) lastBottom = r.bottom + window.scrollY;
    }
  out.contentBottom = Math.round(lastBottom);
  out.viewportHeight = window.innerHeight;
  out.emptyBelow = Math.round(window.innerHeight - lastBottom);

  // sıfır değerlerinin rengi (tabloda "0" metni taşıyan hücreler)
  const zeroCells: unknown[] = [];
  for (const td of Array.from(document.querySelectorAll<HTMLElement>('tbody td'))) {
    const txt = (td.textContent || '').trim();
    if (/^0(\s|$)/.test(txt) || txt === '0') {
      const span = td.querySelector('span') ?? td;
      zeroCells.push({ text: txt.slice(0, 12), color: getComputedStyle(span as Element).color, colIndex: (td as HTMLTableCellElement).cellIndex });
    }
  }
  const uniq = new Map<string, unknown>();
  for (const z of zeroCells as Array<{ colIndex: number; color: string; text: string }>) {
    const k = `${z.colIndex}|${z.color}`;
    if (!uniq.has(k)) uniq.set(k, z);
  }
  out.zeroCellColors = Array.from(uniq.values());

  // kanban sütunları
  const scroller = Array.from(document.querySelectorAll<HTMLElement>('main div')).find(
    (el) => getComputedStyle(el).overflowX === 'auto' && el.children.length >= 3 && el.scrollWidth > el.clientWidth,
  );
  const boardCols = scroller ? (Array.from(scroller.children) as HTMLElement[]) : [];
  if (scroller) out.scroller = { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, cls: (scroller.className || '').toString().slice(0, 100) };
  if (boardCols.length) out.boardColumns = boardCols.map((c) => ({ w: Math.round(c.getBoundingClientRect().width), right: Math.round(c.getBoundingClientRect().right), h: Math.round(c.getBoundingClientRect().height) }));

  // sekme çubuğu
  const tablist = document.querySelector<HTMLElement>('[role="tablist"]');
  if (tablist) {
    const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));
    out.tablist = {
      w: Math.round(tablist.getBoundingClientRect().width),
      bg: getComputedStyle(tablist).backgroundColor,
      tabs: tabs.map((t) => ({ t: (t.textContent || '').trim().slice(0, 18), w: Math.round(t.getBoundingClientRect().width) })),
    };
  }

  // rozetler (renk sayımı için)
  out.badges = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="status-badge"], [data-slot="badge"]')).slice(0, 24).map((b) => ({
    t: (b.textContent || '').trim().slice(0, 14),
    color: getComputedStyle(b).color,
    bg: getComputedStyle(b).backgroundColor,
  }));

  return out;
};

async function main() {
  const base = defaultBaseUrl();
  const args = process.argv.slice(2);
  const browser = await launchBrowser();
  const results: unknown[] = [];
  for (const spec of args) {
    const [route, vp, action] = spec.split('|');
    const [w, h] = (vp ?? '1440x900').split('x').map(Number);
    const ctx = await browser.newContext({ viewport: { width: w!, height: h! }, isMobile: w! < 500, hasTouch: w! < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    try {
      await openRoute(page, { base, route: route!, as: 'admin' });
      if (action === 'board') {
        await page.getByRole('button', { name: /pano|kanban/i }).first().click().catch(async () => {
          const btns = page.locator('main button');
          const n = await btns.count();
          for (let i = 0; i < n; i++) {
            const t = await btns.nth(i).getAttribute('aria-label');
            if (t && /pano|kanban/i.test(t)) { await btns.nth(i).click(); return; }
          }
        });
        await page.waitForTimeout(700);
      }
      const data = await page.evaluate(collect);
      results.push({ route, viewport: `${w}x${h}`, action: action ?? null, ...(data as object) });
    } catch (e) {
      results.push({ route, viewport: `${w}x${h}`, error: String(e).slice(0, 200) });
    }
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(results, null, 1));
}

main();
