/** Tur 8 kritik ölçümü: kur delta ondalık tutarlılığı + detay Belgeler sekmesi tablo/kapsayıcı oranı. */
import { execSync } from 'node:child_process';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = execSync(`psql "postgres://postgres:postgres@localhost:5432/plantero" -t -A -c "select id from export_shipments where doc_no='EXP-2026-000002';"`, { encoding: 'utf8' }).trim();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) kurlar — dailyChange ondalık dağılımı (masaüstü)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
    out.kurlarDelta = await page.evaluate(() => {
      const tb = document.querySelector('table');
      if (!tb) return null;
      const ths = Array.from(tb.querySelectorAll('thead th')).map((t) => (t.textContent ?? '').trim());
      const idx = ths.findIndex((h) => h.includes('Günlük'));
      const vals = Array.from(tb.querySelectorAll('tbody tr')).map((r) => ((r.children[idx] as HTMLElement)?.innerText ?? '').trim());
      const dist: Record<number, number> = {};
      for (const v of vals) { const m = /,(\d+)/.exec(v); const d = m ? m[1]!.length : 0; dist[d] = (dist[d] ?? 0) + 1; }
      return { count: vals.length, sample: vals.slice(0, 25), decimalDistribution: dist };
    });
    await ctx.close();
  }

  // 2) detay Belgeler sekmesi — tablo genişliği vs kapsayıcı/araç çubuğu
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    const tab = page.getByRole('tab', { name: 'Belgeler' });
    await tab.first().click();
    await page.waitForTimeout(500);
    out.detayBelgeler = await page.evaluate(() => {
      const panel = document.querySelector('[role="tabpanel"]:not([hidden])') as HTMLElement | null;
      const tb = panel?.querySelector('table') as HTMLElement | null;
      if (!panel || !tb) return null;
      const wrap = tb.closest('div');
      const thead = tb.querySelector('thead tr') as HTMLElement | null;
      const firstRow = tb.querySelector('tbody tr') as HTMLElement | null;
      const toolbar = panel.querySelector('input[type="search"], input[placeholder]')?.closest('div')?.parentElement as HTMLElement | null;
      const widths = new Map<string, number | null>();
      for (const [k, el] of [['panel', panel], ['table', tb], ['wrap', wrap], ['thead', thead], ['row', firstRow], ['toolbar', toolbar]] as Array<[string, Element | null]>) widths.set(k, el ? Math.round(el.getBoundingClientRect().width) : null);
      // eylemler hücresi taşması
      const actionCell = firstRow?.lastElementChild as HTMLElement | null;
      const btn = actionCell?.querySelector('button') as HTMLElement | null;
      return {
        panelWidth: widths.get('panel'), tableWidth: widths.get('table'), wrapperWidth: widths.get('wrap'), theadRowWidth: widths.get('thead'), rowWidth: widths.get('row'), toolbarWidth: widths.get('toolbar'),
        actionCellWidth: actionCell ? Math.round(actionCell.getBoundingClientRect().width) : null,
        actionBtn: btn ? { w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height) } : null,
        deadRightPx: (widths.get('panel') ?? 0) - (widths.get('table') ?? 0),
      };
    });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
