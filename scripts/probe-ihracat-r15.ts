/** Tur 15 ihracat probu: belge zinciri sırası (determinizm + kanonik sıra), sütun distinct/genişlik, hover/focus. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();

async function tables(page: Page) {
  return page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll('table').forEach((t, ti) => {
      const heads = Array.from(t.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
      const rows = Array.from(t.querySelectorAll('tbody tr'));
      const cols = heads.map((h, i) => {
        const cells = rows.map((r) => (r.children[i]?.textContent ?? '').trim());
        const th = t.querySelectorAll('thead th')[i] as HTMLElement | undefined;
        return { h, width: th ? Math.round(th.getBoundingClientRect().width) : 0, rows: cells.length, distinct: new Set(cells).size, sample: Array.from(new Set(cells)).slice(0, 3) };
      });
      const wrap = t.closest('[class*="overflow"]') as HTMLElement | null;
      out.push({ ti, tableW: Math.round(t.getBoundingClientRect().width), containerW: wrap ? Math.round(wrap.clientWidth) : null, scrollW: wrap ? wrap.scrollWidth : null, rowCount: rows.length, cols });
    });
    return out;
  });
}

/** Zincir kartlarının sırası: her kartın üst etiketi (SİPARİŞ/İRSALİYE/...) + belge no */
async function chainOrder(page: Page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-slot="document-chain"] a, [data-slot="document-chain"] div'));
    // yedek: metin tabanlı — zincir bölgesindeki kartlar
    const region = document.querySelector('[data-chain], [data-slot="document-chain"]') as HTMLElement | null;
    const scope = region ?? (document.querySelector('main') as HTMLElement);
    const nodes = Array.from(scope.querySelectorAll('a,div')).filter((el) => {
      const txt = (el.textContent ?? '').trim();
      return /^(SİPARİŞ|İRSALİYE|FATURA|İHRACAT\s*SEVKİYATI|TEKLİF)\b/i.test(txt) && el.querySelectorAll('a,div').length < 12;
    });
    const seen = new Set<string>();
    const out: Array<{ label: string; docNo: string }> = [];
    for (const el of nodes) {
      const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const label = (txt.match(/^(SİPARİŞ|İRSALİYE|FATURA|İHRACAT SEVKİYATI|TEKLİF)/i) ?? [''])[0];
      const docNo = (txt.match(/(SO|DN|INV|EXP|QT)-\d{4}-\d{6}/) ?? [''])[0];
      const k = label + docNo;
      if (!docNo || seen.has(k)) continue;
      seen.add(k);
      out.push({ label, docNo });
    }
    return { order: out, cardsProbe: cards.length };
  });
}

async function main() {
  const browser = await launchBrowser();
  const res: any = { chain: {}, routes: {} };
  const ships: Array<[string, string]> = [
    ['EXP-2026-000001', id('EXP-2026-000001')],
    ['EXP-2026-000002', id('EXP-2026-000002')],
    ['EXP-2026-000003', id('EXP-2026-000003')],
  ];

  // Zincir sırası — her sevkiyat 3 kez yeniden yüklenir (determinizm)
  for (const [no, sid] of ships) {
    res.chain[no] = [];
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const p = await ctx.newPage();
      await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${sid}`, as: 'admin' });
      res.chain[no].push((await chainOrder(p)).order.map((n) => `${n.label}:${n.docNo}`));
      await ctx.close();
    }
  }

  const routes: Array<[string, string]> = [
    ['sevkiyatlar', '/ihracat/sevkiyatlar'],
    ['belgeler', '/ihracat/belgeler'],
    ['kurlar', '/ihracat/kurlar'],
    ['gtip', '/ihracat/gtip'],
  ];
  for (const [k, route] of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    const t = await tables(page);
    const rowSel = 'table tbody tr';
    const has = await page.locator(rowSel).count();
    let before: string | null = null; let after: string | null = null;
    if (has) {
      before = await page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement | null; return el ? getComputedStyle(el).backgroundColor : null; }, rowSel);
      await page.locator(rowSel).first().hover();
      await page.waitForTimeout(220);
      after = await page.evaluate((s) => { const el = document.querySelector(s) as HTMLElement | null; return el ? getComputedStyle(el).backgroundColor : null; }, rowSel);
    }
    res.routes[k] = { tables: t, rowBgBefore: before, rowBgAfter: after };
    await ctx.close();
  }

  writeFileSync('artifacts/critic/probe-ihracat-r15.json', JSON.stringify(res, null, 2));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
