/**
 * gorsel-critic Tur 3 — Ar-Ge modülü ölçüm probu.
 * Kullanım: pnpm tsx scripts/probe-arge-r3.ts <projectId> [--viewport 1440x900]
 * stdout: tek JSON.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const pid = process.argv[2]!;
const vpArg = process.argv.includes('--viewport') ? process.argv[process.argv.indexOf('--viewport') + 1]! : '1440x900';
const [w, h] = vpArg.split('x').map(Number) as [number, number];
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = { viewport: vpArg };

  // ---- /arge/projeler
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700, isMobile: w < 700 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/projeler', as: 'admin' });
    out.projeler = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const firstRow = document.querySelector('tbody tr') ?? document.querySelector('ul > li');
      const mainTop = main.getBoundingClientRect().top;
      const costCells = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const cell = tds.find((td) => /₺/.test(td.textContent ?? ''));
        return cell ? { text: (cell.textContent ?? '').trim(), color: getComputedStyle(cell.querySelector('*') ?? cell).color } : null;
      });
      const h1 = document.querySelector('h1');
      return {
        firstRowTopViewport: firstRow ? Math.round(firstRow.getBoundingClientRect().top) : null,
        contentOffset: firstRow ? Math.round(firstRow.getBoundingClientRect().top - mainTop) : null,
        h1Text: h1?.textContent,
        costCells,
        docScrollH: document.documentElement.scrollHeight,
      };
    });
    await ctx.close();
  }

  // ---- /arge/receteler
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700, isMobile: w < 700 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/arge/receteler', as: 'admin' });
    out.receteler = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const firstRow = document.querySelector('tbody tr') ?? document.querySelector('ul > li');
      const cards = Array.from(document.querySelectorAll('ul > li')).map((li) => (li as HTMLElement).innerText.replace(/\n/g, ' | '));
      const costCells = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const cell = tds.find((td) => /₺/.test(td.textContent ?? ''));
        return cell ? { text: (cell.textContent ?? '').trim(), color: getComputedStyle(cell.querySelector('*') ?? cell).color } : null;
      });
      return {
        contentOffset: firstRow ? Math.round(firstRow.getBoundingClientRect().top - main.getBoundingClientRect().top) : null,
        cards,
        costCells,
      };
    });
    await ctx.close();
  }

  // ---- board
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700, isMobile: w < 700 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${pid}/board`, as: 'admin' });
    await page.waitForTimeout(600);
    out.board = await page.evaluate(() => {
      const cols = Array.from(document.querySelectorAll('div')).filter((d) => d.querySelector(':scope > div > button[aria-label="Kolonu sürükle"]'));
      const colInfo = cols.map((c) => {
        const el = c as HTMLElement;
        const r = el.getBoundingClientRect();
        const cards = Array.from(el.querySelectorAll('button.rounded-lg.border'));
        const addBtn = Array.from(el.querySelectorAll('button')).find((b) => /Kart ekle/.test(b.textContent ?? ''));
        const last = cards[cards.length - 1] as HTMLElement | undefined;
        return {
          name: (el.querySelector('span.truncate')?.textContent ?? '').trim(),
          h: Math.round(r.height),
          cards: cards.length,
          gapLastCardToAdd: last && addBtn ? Math.round(addBtn.getBoundingClientRect().top - last.getBoundingClientRect().bottom) : null,
          addBtnH: addBtn ? Math.round(addBtn.getBoundingClientRect().height) : null,
          text: el.innerText.replace(/\n/g, ' | ').slice(0, 160),
        };
      });
      const scroller = document.querySelector('.scroll-fade-x') as HTMLElement | null;
      const tabs = Array.from(document.querySelectorAll('a')).filter((a) => /^(Pano|Deneme Reçeteleri)$/.test((a.textContent ?? '').trim())).map((a) => {
        const r = a.getBoundingClientRect();
        return { t: (a.textContent ?? '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
      });
      const pills = Array.from(document.querySelectorAll('button')).filter((b) => /^(Fikir|Formülasyon|Pilot Üretim|Duyusal Test|Raf Ömrü|Onay)$/.test((b.textContent ?? '').trim())).map((b) => ({ t: b.textContent, w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
      return {
        columnCount: cols.length,
        colInfo,
        scroller: scroller ? { scrollW: scroller.scrollWidth, clientW: scroller.clientWidth, h: Math.round(scroller.getBoundingClientRect().height), scrollLeft: Math.round(scroller.scrollLeft) } : null,
        tabs,
        pills,
        docScrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
      };
    });
    await ctx.close();
  }

  // ---- proje reçeteleri (loading + tablo)
  {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 700, isMobile: w < 700 });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await openRoute(page, { base, route: `/arge/projeler/${pid}/receteler`, as: 'admin' });
    const afterOpen = await page.evaluate(() => {
      const panel = document.querySelector('.rounded-xl.border.bg-card, [class*="rounded-xl"][class*="bg-card"]') as HTMLElement | null;
      const busy = /Yükleniyor/.test(document.body.innerText);
      return { busy, panelH: panel ? Math.round(panel.getBoundingClientRect().height) : null };
    });
    const tOpen = Date.now() - t0;
    // içerik gelene kadar bekle
    let waited = 0;
    while (waited < 8000) {
      const busy = await page.evaluate(() => /Yükleniyor/.test(document.body.innerText));
      if (!busy) break;
      await page.waitForTimeout(50);
      waited += 50;
    }
    await page.waitForTimeout(300);
    out.precete = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr')).map((r) => Math.round(r.getBoundingClientRect().height));
      const tableWrap = document.querySelector('table')?.parentElement as HTMLElement | null;
      const table = document.querySelector('table') as HTMLElement | null;
      const controls = Array.from(document.querySelectorAll('input, button, [role="combobox"]')).filter((e) => (e as HTMLElement).offsetParent !== null);
      const below44 = controls.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map((e) => ({ t: (e.textContent || (e as HTMLInputElement).value || (e as HTMLElement).getAttribute('aria-label') || '').slice(0, 30), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }));
      // hedef maliyet çubuğu rengi
      const bodyText = document.body.innerText;
      const overTarget = Array.from(document.querySelectorAll('*')).filter((e) => /hedef üstü/.test(e.textContent ?? '') && e.children.length === 0 || /hedef üstü/.test((e as HTMLElement).innerText ?? '') && e.children.length <= 2);
      const overEl = overTarget[overTarget.length - 1] as HTMLElement | undefined;
      const moneyOnBar = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && /₺103,41/.test(e.textContent ?? '')) as HTMLElement | undefined;
      const panel = Array.from(document.querySelectorAll('div')).find((d) => d.className.includes('rounded-xl') && d.className.includes('bg-card')) as HTMLElement | undefined;
      const uomCells = Array.from(document.querySelectorAll('tbody tr')).map((r) => (r as HTMLElement).innerText.replace(/\n/g, ' | '));
      return {
        rowHeights: rows,
        tableScrollW: tableWrap ? tableWrap.scrollWidth : null,
        tableClientW: tableWrap ? tableWrap.clientWidth : null,
        tableW: table ? Math.round(table.getBoundingClientRect().width) : null,
        controlsBelow44: below44.length,
        controlsBelow44Sample: below44.slice(0, 12),
        overTargetText: overEl?.innerText?.slice(0, 60),
        overTargetColor: overEl ? getComputedStyle(overEl).color : null,
        barMoneyColor: moneyOnBar ? getComputedStyle(moneyOnBar).color : null,
        barMoneyText: moneyOnBar?.textContent,
        panelH: panel ? Math.round(panel.getBoundingClientRect().height) : null,
        rowSample: uomCells.slice(0, 3),
        hasSkeleton: /animate-pulse/.test(document.body.innerHTML),
        docScrollH: document.documentElement.scrollHeight,
      };
    });
    (out.precete as Record<string, unknown>).loadingAtOpen = afterOpen.busy;
    (out.precete as Record<string, unknown>).loadingPanelH = afterOpen.panelH;
    (out.precete as Record<string, unknown>).msOpen = tOpen;
    (out.precete as Record<string, unknown>).msExtraWaitForContent = waited;
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => { console.error(e); process.exit(1); });
