/**
 * Tur 8 düzeltme doğrulaması: ihracat-detay-19 (P1), ihracat-kurlar-11/-12 (P2).
 * db:reset sonrası sevkiyat id'leri değişebildiğinden EXP-2026-000002'nin id'si canlı okunur
 * (bkz. probe-ihracat-r8-fix.ts'teki aynı gerekçe).
 */
import { execSync } from 'node:child_process';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
function resolveShipmentId(): string {
  const out = execSync(`psql "${process.env.DATABASE_URL}" -t -A -c "select id from export_shipments where doc_no = 'EXP-2026-000002';"`, { encoding: 'utf8' }).trim();
  if (!out) throw new Error('EXP-2026-000002 bulunamadı — db:seed/db:reset çalıştırılmış mı?');
  return out;
}
const SHIP = resolveShipmentId();

function colSlack() {
  return () => {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.map((tb) => {
      const ths = Array.from(tb.querySelectorAll('thead th'));
      const rows = Array.from(tb.querySelectorAll('tbody tr')).slice(0, 40);
      const cols = ths.map((th, i) => {
        const w = th.getBoundingClientRect().width;
        let maxContent = 0;
        for (const r of rows) {
          const cell = r.children[i] as HTMLElement | undefined;
          if (!cell) continue;
          const rng = document.createRange();
          rng.selectNodeContents(cell);
          const b = rng.getBoundingClientRect();
          if (b.width > maxContent) maxContent = b.width;
        }
        const hr = document.createRange();
        hr.selectNodeContents(th);
        const hw = hr.getBoundingClientRect().width;
        return { head: (th.textContent ?? '').trim().slice(0, 24), width: Math.round(w), maxContent: Math.round(Math.max(maxContent, hw)), slack: Math.round(w - Math.max(maxContent, hw)) };
      });
      return { tableWidth: Math.round(tb.getBoundingClientRect().width), rows: rows.length, cols };
    });
  };
}

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) ihracat-detay-19: panel/toolbar/table genişliği + sütun slack (Belgeler sekmesi, showShipmentColumn=false)
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
      const thead = tb.querySelector('thead tr') as HTMLElement | null;
      const firstRow = tb.querySelector('tbody tr') as HTMLElement | null;
      const toolbar = panel.querySelector('input[type="search"], input[placeholder]')?.closest('div')?.parentElement as HTMLElement | null;
      const widths = new Map<string, number | null>();
      for (const [k, el] of [['panel', panel], ['table', tb], ['thead', thead], ['row', firstRow], ['toolbar', toolbar]] as Array<[string, Element | null]>) widths.set(k, el ? Math.round(el.getBoundingClientRect().width) : null);
      return {
        panelWidth: widths.get('panel'), tableWidth: widths.get('table'), theadRowWidth: widths.get('thead'), rowWidth: widths.get('row'), toolbarWidth: widths.get('toolbar'),
        deadRightPx: (widths.get('panel') ?? 0) - (widths.get('table') ?? 0),
      };
    });
    out.detayBelgelerCols = await page.evaluate(colSlack());
    const scroll = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    out.detayBelgelerScroll = scroll;
    await ctx.close();
  }

  // 2) regresyon: /ihracat/belgeler panosu (showShipmentColumn=true) hâlâ sağlıklı mı
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: '/ihracat/belgeler', as: 'admin' });
    out.belgelerPano = await page.evaluate(colSlack());
    await ctx.close();
  }

  // 3) regresyon: detay Sipariş satırları / Çeki listesi (Tur 8'de kapatılan detay-18) hâlâ sağlıklı mı
  for (const tabName of ['Sipariş satırları', 'Çeki listesi']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    const l = page.getByRole('tab', { name: tabName });
    await l.first().click();
    await page.waitForTimeout(500);
    out[`detay_${tabName}`] = await page.evaluate(colSlack());
    await ctx.close();
  }

  // 4) kurlar: sütun slack + ondalık dağılımı
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
    out.kurlarCols = await page.evaluate(colSlack());
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
    const scroll = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    out.kurlarScroll = scroll;
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
