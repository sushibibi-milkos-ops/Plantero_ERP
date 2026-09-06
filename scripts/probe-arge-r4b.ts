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
      await openRoute(page, { route: '/arge/receteler', as: 'arge', base });
      out.dataTableHeader = await page.evaluate(() => {
        const th = document.querySelector('thead th');
        const cs = th ? getComputedStyle(th) : null;
        const inner = th?.querySelector('button');
        const ics = inner ? getComputedStyle(inner) : null;
        return { th: cs ? { fontSize: cs.fontSize, textTransform: cs.textTransform, letterSpacing: cs.letterSpacing, color: cs.color, bg: cs.backgroundColor } : null, inner: ics ? { fontSize: ics.fontSize, textTransform: ics.textTransform, fontWeight: ics.fontWeight } : null };
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: `/arge/projeler/${PID}/receteler`, as: 'arge', base });
      out.unitCostEdges = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[role="row"]')).filter((el) => el.querySelectorAll('[role="cell"]').length > 0);
        const res: unknown[] = [];
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll(':scope > [role="cell"]')) as HTMLElement[];
          const pair: Record<string, unknown> = {};
          for (const spec of [['unit', 3], ['line', 5]] as Array<[string, number]>) {
            const host = cells[spec[1]];
            if (!host) continue;
            const vis = (Array.from(host.children) as HTMLElement[]).filter((n) => n.getBoundingClientRect().width > 0);
            const t = vis[vis.length - 1];
            if (!t) continue;
            const inp = (t.tagName === 'INPUT' ? t : t.querySelector('input')) as HTMLInputElement | null;
            if (inp) {
              const b = inp.getBoundingClientRect();
              const cs = getComputedStyle(inp);
              pair[spec[0]] = { kind: 'input', right: +b.right.toFixed(1), padRight: cs.paddingRight, textRight: +(b.right - parseFloat(cs.paddingRight)).toFixed(1), fv: cs.fontVariantNumeric };
            } else {
              const range = document.createRange();
              range.selectNodeContents(t);
              const rb = range.getBoundingClientRect();
              pair[spec[0]] = { kind: 'text', right: +rb.right.toFixed(1), textRight: +rb.right.toFixed(1), text: (t.textContent ?? '').trim(), fv: getComputedStyle(t).fontVariantNumeric };
            }
          }
          res.push(pair);
        }
        return res;
      });
      out.tabularNums = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[role="row"]')).filter((el) => el.querySelectorAll('[role="cell"]').length > 0);
        const out: unknown[] = [];
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll(':scope > [role="cell"]'));
          for (const idx of [1, 3, 4, 5]) {
            const c = cells[idx] as HTMLElement | undefined;
            if (!c) continue;
            const el = (c.querySelector('input') ?? c.lastElementChild) as HTMLElement | null;
            if (!el) continue;
            out.push({ idx, fv: getComputedStyle(el).fontVariantNumeric, ff: getComputedStyle(el).fontFamily.split(',')[0] });
          }
          break;
        }
        return out;
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/arge/receteler', as: 'arge', base });
      out.mobileCards = await page.evaluate(() => {
        const main = document.querySelector('main');
        const lis = Array.from(main?.querySelectorAll('li') ?? []);
        return lis.slice(0, 3).map((li) => { const b = li.getBoundingClientRect(); return { text: (li.textContent ?? '').replace(/\s+/g, ' ').trim(), top: Math.round(b.top), h: Math.round(b.height) }; });
      });
      out.mobileSepHtml = await page.evaluate(() => {
        const main = document.querySelector('main');
        const li = main?.querySelector('li');
        return li ? li.innerHTML.replace(/\s+/g, ' ').slice(0, 700) : null;
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/arge/projeler', as: 'arge', base });
      out.projelerMobile = await page.evaluate(() => {
        const main = document.querySelector('main');
        const lis = Array.from(main?.querySelectorAll('li') ?? []);
        const first = lis[0];
        return { firstTop: first ? Math.round(first.getBoundingClientRect().top) : null, count: lis.length, texts: lis.slice(0, 2).map((l) => (l.textContent ?? '').replace(/\s+/g, ' ').trim()) };
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: `/arge/projeler/${PID}/board`, as: 'arge', base });
      out.board = await page.evaluate(() => {
        const scrollers = Array.from(document.querySelectorAll('main *')).filter((el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1).map((el) => ({ cls: (el.className || '').toString().slice(0, 60), sw: (el as HTMLElement).scrollWidth, cw: (el as HTMLElement).clientWidth }));
        const colHeads = Array.from(document.querySelectorAll('main h3, main [class*="column"]')).slice(0, 8).map((el) => { const b = el.getBoundingClientRect(); return { t: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) }; });
        return { scrollers, colHeads, scrollHeight: document.documentElement.scrollHeight, viewportH: window.innerHeight };
      });
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
