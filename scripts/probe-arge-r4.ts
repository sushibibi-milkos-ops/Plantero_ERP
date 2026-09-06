/** gorsel-critic Tur 4 — Ar-Ge ölçüm probu. stdout: tek JSON. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '8f87f82e-8c96-4f2b-a23a-729b97e9b722';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: `/arge/projeler/${PID}/receteler`, as: 'arge', base });
      out.receteler1440 = await page.evaluate(() => {
        const dataRows = Array.from(document.querySelectorAll('[role="row"]')).filter((el) => el.querySelectorAll('[role="cell"]').length > 0);
        const unitCells = dataRows.map((row) => {
          const cells = Array.from(row.querySelectorAll(':scope > [role="cell"]'));
          const uc = cells[3] as HTMLElement | undefined;
          const inp = uc?.querySelector('input') as HTMLInputElement | null;
          const money = uc?.querySelector('span.tabular-nums, span[class*="tabular"]') as HTMLElement | null;
          const inner = (inp ?? money) as HTMLElement | null;
          const ib = inner?.getBoundingClientRect();
          return {
            kind: inp ? 'input' : 'text',
            text: (uc?.textContent ?? '').trim(),
            innerRight: ib ? +ib.right.toFixed(1) : null,
            innerLeft: ib ? +ib.left.toFixed(1) : null,
            paddingRight: inner ? getComputedStyle(inner).paddingRight : null,
            textAlign: inner ? getComputedStyle(inner).textAlign : null,
          };
        });
        const scrapCells = dataRows.map((row) => {
          const cells = Array.from(row.querySelectorAll(':scope > [role="cell"]'));
          const sc = cells[4] as HTMLElement | undefined;
          const inp = sc?.querySelector('input') as HTMLInputElement | null;
          const b = inp?.getBoundingClientRect();
          return { value: inp?.value, right: b ? +b.right.toFixed(1) : null, left: b ? +b.left.toFixed(1) : null, textAlign: inp ? getComputedStyle(inp).textAlign : null, color: inp ? getComputedStyle(inp).color : null };
        });
        const rowH = dataRows.map((r) => +r.getBoundingClientRect().height.toFixed(1));
        const header = document.querySelector('[role="row"]:not(:has([role="cell"]))') as HTMLElement | null;
        const hs = header ? getComputedStyle(header) : null;
        const heads = Array.from(header?.querySelectorAll('[role="columnheader"]') ?? []).map((el) => {
          const b = el.getBoundingClientRect();
          return { t: (el.textContent ?? '').trim(), left: +b.left.toFixed(1), right: +b.right.toFixed(1), align: getComputedStyle(el).textAlign };
        });
        const ta = document.querySelector('textarea') as HTMLTextAreaElement | null;
        const main = document.querySelector('main') as HTMLElement | null;
        const boxed = Array.from(main?.querySelectorAll('*') ?? []).filter((el) => {
          const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
          return b.width > 150 && b.height > 50 && parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderBottomWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderRightWidth) > 0 && cs.borderTopStyle !== 'none';
        }).map((el) => { const b = el.getBoundingClientRect(); return { cls: (el.className || '').toString().slice(0, 70), w: Math.round(b.width), h: Math.round(b.height) }; });
        return {
          headerStyle: hs ? { fontSize: hs.fontSize, textTransform: hs.textTransform, letterSpacing: hs.letterSpacing, bg: hs.backgroundColor } : null,
          heads, unitCells, scrapCells, rowH,
          textarea: ta ? { resize: getComputedStyle(ta).resize, h: Math.round(ta.getBoundingClientRect().height), minH: getComputedStyle(ta).minHeight } : null,
          boxedCount: boxed.length, boxed,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: `/arge/projeler/${PID}/receteler`, as: 'arge', base });
      out.receteler390 = await page.evaluate(() => {
        const panel = document.querySelector('[role="table"]');
        const all = Array.from(document.querySelectorAll('span,p,h1,h2,button,label'));
        const hedef = all.find((e) => (e.textContent ?? '').trim() === 'Hedef maliyete göre');
        const vers = all.find((e) => (e.textContent ?? '').trim() === 'VERSİYONLAR');
        const save = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Kaydet');
        const send = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Onaya gönder'));
        const trash = document.querySelector('button[aria-label="Satırı sil"]');
        const tb = trash?.getBoundingClientRect();
        const trashRow = trash?.parentElement?.getBoundingClientRect();
        return {
          panelTop: panel ? +panel.getBoundingClientRect().top.toFixed(1) : null,
          hedefTop: hedef ? +hedef.getBoundingClientRect().top.toFixed(1) : null,
          versTop: vers ? +vers.getBoundingClientRect().top.toFixed(1) : null,
          saveRect: save ? { y: Math.round(save.getBoundingClientRect().top), w: Math.round(save.getBoundingClientRect().width), h: Math.round(save.getBoundingClientRect().height) } : null,
          sendRect: send ? { y: Math.round(send.getBoundingClientRect().top), w: Math.round(send.getBoundingClientRect().width), h: Math.round(send.getBoundingClientRect().height) } : null,
          trash: tb ? { w: Math.round(tb.width), h: Math.round(tb.height) } : null,
          trashRowH: trashRow ? Math.round(trashRow.height) : null,
          rowH: Array.from(document.querySelectorAll('[role="row"]')).filter((el) => el.querySelectorAll('[role="cell"]').length > 0).map((r) => Math.round(r.getBoundingClientRect().height)),
          scrollHeight: document.documentElement.scrollHeight,
        };
      });
      await ctx.close();
    }
    for (const pair of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: pair[1], as: 'arge', base });
      out[pair[0] + 'FirstRow'] = await page.evaluate(() => {
        const main = document.querySelector('main');
        const row = document.querySelector('tbody tr');
        const mt = main ? main.getBoundingClientRect().top : 0;
        return {
          mainTop: +mt.toFixed(1),
          h1Top: document.querySelector('h1') ? +document.querySelector('h1')!.getBoundingClientRect().top.toFixed(1) : null,
          theadTop: document.querySelector('thead') ? +document.querySelector('thead')!.getBoundingClientRect().top.toFixed(1) : null,
          firstRowTop: row ? +row.getBoundingClientRect().top.toFixed(1) : null,
          offsetFromMain: row ? +(row.getBoundingClientRect().top - mt).toFixed(1) : null,
        };
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/arge/receteler', as: 'arge', base });
      out.recetelerMobileCards = await page.evaluate(() => Array.from(document.querySelectorAll('ul > li')).slice(0, 3).map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim()));
      out.recetelerMobileFirstCard = await page.evaluate(() => {
        const li = document.querySelector('ul > li');
        return li ? +li.getBoundingClientRect().top.toFixed(1) : null;
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/arge/projeler', as: 'arge', base });
      out.projelerMobile = await page.evaluate(() => {
        const li = document.querySelector('ul > li');
        const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Yeni proje'));
        return {
          firstCardTop: li ? +li.getBoundingClientRect().top.toFixed(1) : null,
          newBtn: btn ? { w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height) } : null,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: `/arge/projeler/${PID}/board`, as: 'arge', base });
      out.board1440 = await page.evaluate(() => {
        const cols = Array.from(document.querySelectorAll('[data-column-id], [role="list"]')).map((el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; });
        const chips = Array.from(document.querySelectorAll('button')).filter((b) => ['Fikir', 'Formülasyon', 'Pilot Üretim', 'Duyusal Test', 'Raf Ömrü', 'Onay'].includes((b.textContent ?? '').trim())).map((b) => ({ t: (b.textContent ?? '').trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
        const scroller = document.querySelector('[data-board-scroller], main div[class*="overflow-x"]');
        return { cols, chips, scroller: scroller ? { sw: (scroller as HTMLElement).scrollWidth, cw: (scroller as HTMLElement).clientWidth } : null, scrollHeight: document.documentElement.scrollHeight };
      });
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
