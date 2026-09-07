/** Tur 11 ihracat ölçüm probu: sütun genişliği/dolu oranı/distinct, hover-focus, boş durum. */
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
        const filled = cells.filter((c) => c && c !== '—' && c !== '-').length;
        const th = t.querySelectorAll('thead th')[i] as HTMLElement | undefined;
        const w = th ? Math.round(th.getBoundingClientRect().width) : 0;
        return { h, width: w, rows: cells.length, filled, distinct: new Set(cells).size, sample: cells.slice(0, 3) };
      });
      const wrap = t.closest('[class*="overflow"]') as HTMLElement | null;
      out.push({ ti, tableW: Math.round(t.getBoundingClientRect().width), containerW: wrap ? Math.round(wrap.clientWidth) : null, scrollW: wrap ? wrap.scrollWidth : null, rowCount: rows.length, cols });
    });
    return out;
  });
}

async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  const SHIP = id('EXP-2026-000002');

  const routes: Array<[string, string]> = [
    ['sevkiyatlar', '/ihracat/sevkiyatlar'],
    ['belgeler', '/ihracat/belgeler'],
    ['kurlar', '/ihracat/kurlar'],
    ['gtip', '/ihracat/gtip'],
    ['yeni', '/ihracat/sevkiyatlar/yeni'],
  ];
  for (const [k, route] of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    const t = await tables(page);
    // hover + focus
    const inter = await page.evaluate(() => {
      const tr = document.querySelector('table tbody tr') as HTMLElement | null;
      const btn = document.querySelector('main button') as HTMLElement | null;
      let focus = null;
      if (btn) { btn.focus(); const cs = getComputedStyle(btn); focus = { outline: `${cs.outlineWidth} ${cs.outlineStyle}`, boxShadow: cs.boxShadow.slice(0, 80) }; }
      return { rowBg: tr ? getComputedStyle(tr).backgroundColor : null, focus };
    });
    let hoverAfter: string | null = null;
    if (t.length && t[0].rowCount) { await page.locator('table tbody tr').first().hover(); await page.waitForTimeout(200); hoverAfter = await page.evaluate(() => getComputedStyle(document.querySelector('table tbody tr') as HTMLElement).backgroundColor); }
    // yeni: sipariş seçeneği sayısı
    let selectOpts: number | null = null;
    if (k === 'yeni') selectOpts = await page.evaluate(() => document.querySelectorAll('select')[0]?.options.length ?? -1);
    res[k] = { tables: t, inter, hoverAfter, selectOpts };
    await ctx.close();
  }

  // detay sekmeleri
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
  for (const name of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
    await p.getByRole('tab', { name }).first().click();
    await p.waitForTimeout(400);
    res[`detay:${name}`] = await tables(p);
  }
  await ctx.close();

  // 390 taşma kontrolü (tüm rotalar)
  const ctxm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const pm = await ctxm.newPage();
  const mob: any = {};
  for (const [k, route] of [...routes, ['detay', `/ihracat/sevkiyatlar/${SHIP}`] as [string, string]]) {
    await openRoute(pm, { base: BASE, route, as: 'admin' });
    mob[k] = await pm.evaluate(() => {
      const de = document.documentElement;
      const wide: string[] = [];
      document.querySelectorAll('main *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') wide.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)}@${Math.round(r.right)}`); });
      // kart yükseklikleri
      const cards = Array.from(document.querySelectorAll('main ul > li')).map((c) => Math.round(c.getBoundingClientRect().height));
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, wideCount: wide.length, wide: wide.slice(0, 5), cardHeights: Array.from(new Set(cards)).sort((a, b) => a - b) };
    });
  }
  res.mobile = mob;
  await ctxm.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r12.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
