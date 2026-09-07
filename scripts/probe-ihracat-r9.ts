/**
 * Tur 9 kritik ölçümü — ihracat modülü.
 * Ölçülenler:
 *  - Her liste tablosunda sütun slack (width - max(içerik, başlık))
 *  - Tek-değerli (bilgi taşımayan) sütunlar: satırların tamamı aynı metin
 *  - KpiCard sıfır değerlerinin rengi (kriter 6 "sıfır değerler soluk")
 *  - Sevkiyat detayının 4 sekmesi: panel/tablo genişliği, sütun slack, boş durum
 *  - Tablo sağındaki ölü alan (deadRightPx)
 */
import { execSync } from 'node:child_process';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';

function shipmentId(docNo: string): string {
  const out = execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no = '${docNo}';"`, { encoding: 'utf8' }).trim();
  if (!out) throw new Error(`${docNo} bulunamadı`);
  return out;
}

function tableProbe() {
  return () => {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.map((tb) => {
      const ths = Array.from(tb.querySelectorAll('thead th'));
      const rows = Array.from(tb.querySelectorAll('tbody tr'));
      const cols = ths.map((th, i) => {
        const w = th.getBoundingClientRect().width;
        let maxContent = 0;
        const values: string[] = [];
        for (const r of rows) {
          const cell = r.children[i] as HTMLElement | undefined;
          if (!cell) continue;
          const rng = document.createRange();
          rng.selectNodeContents(cell);
          const b = rng.getBoundingClientRect();
          if (b.width > maxContent) maxContent = b.width;
          values.push((cell.textContent ?? '').replace(/\s+/g, ' ').trim());
        }
        const hr = document.createRange();
        hr.selectNodeContents(th);
        const hw = hr.getBoundingClientRect().width;
        const need = Math.max(maxContent, hw);
        const uniq = Array.from(new Set(values.filter((v) => v.length > 0)));
        return {
          head: (th.textContent ?? '').trim().slice(0, 28),
          width: Math.round(w),
          maxContent: Math.round(need),
          slack: Math.round(w - need),
          align: getComputedStyle(th).textAlign,
          rowsWithText: values.filter((v) => v.length > 0).length,
          distinctValues: uniq.length,
          sample: uniq.slice(0, 3),
        };
      });
      const container = tb.parentElement as HTMLElement | null;
      return {
        tableWidth: Math.round(tb.getBoundingClientRect().width),
        containerWidth: container ? Math.round(container.getBoundingClientRect().width) : null,
        containerScrollWidth: container ? container.scrollWidth : null,
        rows: rows.length,
        cols,
      };
    });
  };
}

function kpiProbe() {
  return () => {
    const cards = Array.from(document.querySelectorAll('[data-slot="kpi-card"], [data-testid^="kpi"]'));
    const pool = cards.length
      ? cards
      : Array.from(document.querySelectorAll('div')).filter((d) => {
          const cs = getComputedStyle(d);
          return parseFloat(cs.fontSize) >= 22 && (d.textContent ?? '').trim().length < 24 && d.children.length === 0;
        });
    return pool.slice(0, 12).map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        fontVariantNumeric: cs.fontVariantNumeric,
      };
    });
  };
}

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  const SHIP = shipmentId('EXP-2026-000002');
  const SHIP_CLOSED = shipmentId('EXP-2026-000001');
  out._ids = { SHIP, SHIP_CLOSED };

  const routes: Array<[string, string]> = [
    ['sevkiyatlar', '/ihracat/sevkiyatlar'],
    ['belgeler', '/ihracat/belgeler'],
    ['kurlar', '/ihracat/kurlar'],
    ['gtip', '/ihracat/gtip'],
  ];

  for (const [key, route] of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    out[`${key}_tables`] = await page.evaluate(tableProbe());
    out[`${key}_kpi`] = await page.evaluate(kpiProbe());
    out[`${key}_scroll`] = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    // sütun seçicideki gizli sütunlar
    out[`${key}_hiddenCols`] = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => /sütun/i.test(b.getAttribute('aria-label') ?? '') || /sütun/i.test(b.title ?? ''));
      return btn ? (btn.getAttribute('aria-label') ?? btn.title) : null;
    });
    await ctx.close();
  }

  // Sevkiyat detayı — 4 sekme
  for (const [label, id] of [['customs', SHIP], ['closed', SHIP_CLOSED]] as Array<[string, string]>) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${id}`, as: 'admin' });
    const tabs = ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur'];
    const res: Record<string, unknown> = {};
    for (const t of tabs) {
      const tab = page.getByRole('tab', { name: t });
      if ((await tab.count()) === 0) { res[t] = 'sekme yok'; continue; }
      await tab.first().click();
      await page.waitForTimeout(400);
      res[t] = await page.evaluate(() => {
        const panel = document.querySelector('[role="tabpanel"]:not([hidden])') as HTMLElement | null;
        if (!panel) return null;
        const tb = panel.querySelector('table') as HTMLElement | null;
        const pw = Math.round(panel.getBoundingClientRect().width);
        const tw = tb ? Math.round(tb.getBoundingClientRect().width) : null;
        return {
          panelWidth: pw,
          tableWidth: tw,
          deadRightPx: tw === null ? null : pw - tw,
          panelHeight: Math.round(panel.getBoundingClientRect().height),
          text: (panel.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
        };
      });
      res[`${t}__cols`] = await page.evaluate(tableProbe());
    }
    out[`detay_${label}`] = res;
    await ctx.close();
  }

  // Mobil: 390px detay + belgeler
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    const res: Record<string, unknown> = {};
    for (const t of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
      const tab = page.getByRole('tab', { name: t });
      if ((await tab.count()) === 0) continue;
      await tab.first().click();
      await page.waitForTimeout(400);
      res[t] = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
        tables: Array.from(document.querySelectorAll('[role="tabpanel"]:not([hidden]) table')).map((tb) => ({ w: Math.round(tb.getBoundingClientRect().width), sw: (tb.parentElement as HTMLElement).scrollWidth })),
      }));
    }
    out.detay_mobil = res;
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
