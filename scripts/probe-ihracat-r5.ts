/**
 * Tur 5 kritik ölçümleri (ihracat).
 * Kullanım: pnpm tsx scripts/probe-ihracat-r5.ts <shipmentId>
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = process.argv[2]!;
const out: Record<string, unknown> = {};

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();

  // --- 1) GTİP: Tip sütunu benzersiz değerler + kolon genişlikleri
  await openRoute(page, { base: BASE, route: '/ihracat/gtip', as: 'admin' });
  out.gtip = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return { err: 'tablo yok' };
    const heads = [...table.querySelectorAll('thead th')].map((th) => ({ t: (th.textContent || '').trim(), w: Math.round(th.getBoundingClientRect().width), align: getComputedStyle(th).textAlign }));
    const rows = [...table.querySelectorAll('tbody tr')];
    const colVals: Record<string, Set<string>> = {};
    heads.forEach((h, i) => { colVals[h.t || `c${i}`] = new Set(); });
    for (const r of rows) {
      const tds = [...r.querySelectorAll('td')];
      heads.forEach((h, i) => { const v = (tds[i]?.textContent || '').trim(); colVals[h.t || `c${i}`]!.add(v); });
    }
    const wrap = table.closest('[class*=overflow]') as HTMLElement | null;
    return {
      heads,
      rowCount: rows.length,
      distinctPerCol: Object.fromEntries(Object.entries(colVals).map(([k, v]) => [k, { n: v.size, sample: [...v].slice(0, 4) }])),
      tableW: Math.round(table.getBoundingClientRect().width),
      wrapW: wrap ? Math.round(wrap.clientWidth) : null,
      wrapScrollH: wrap ? wrap.scrollHeight : null,
      wrapClientH: wrap ? wrap.clientHeight : null,
      docScrollH: document.documentElement.scrollHeight,
    };
  });

  // --- 2) Yeni form: combobox açık hâli
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar/yeni', as: 'admin' });
  const trig = page.locator('#shipment-sales-order-trigger');
  await trig.click();
  await page.waitForTimeout(500);
  out.orderPicker = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[role="option"]')].map((o) => ({
      text: (o.textContent || '').trim(),
      h: Math.round(o.getBoundingClientRect().height),
      lines: [...o.querySelectorAll('*')].filter((e) => e.children.length === 0).map((e) => ({ t: (e.textContent || '').trim(), fs: getComputedStyle(e).fontSize, fvn: getComputedStyle(e).fontVariantNumeric, color: getComputedStyle(e).color })),
    }));
    return { count: opts.length, opts: opts.slice(0, 4) };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // --- 3) Boş form gönder → hata durumu
  await page.getByRole('button', { name: 'Sevkiyat oluştur' }).click();
  await page.waitForTimeout(700);
  out.formError = await page.evaluate(() => {
    const t = document.querySelector('#shipment-sales-order-trigger') as HTMLElement | null;
    const cs = t ? getComputedStyle(t) : null;
    const msgs = [...document.querySelectorAll('[data-slot="form-message"], [role="alert"], .text-destructive')].map((m) => ({ t: (m.textContent || '').trim(), color: getComputedStyle(m).color }));
    return {
      triggerAriaInvalid: t?.getAttribute('aria-invalid'),
      triggerBorder: cs?.borderColor,
      triggerFocused: document.activeElement === t,
      activeEl: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
      msgs,
      scrollY: window.scrollY,
    };
  });

  // --- 4) Sevkiyat detayı: Belgeler sekmesi hizalama + tab list
  await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
  await page.getByRole('tab', { name: 'Belgeler' }).click();
  await page.waitForTimeout(400);
  out.detailDocs = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')];
    const table = tables[tables.length - 1];
    if (!table) return { err: 'yok' };
    const th = [...table.querySelectorAll('thead th')].map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim(), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), align: getComputedStyle(e).textAlign }; });
    const firstRow = table.querySelector('tbody tr');
    const td = firstRow ? [...firstRow.querySelectorAll('td')].map((e) => { const r = e.getBoundingClientRect(); const inner = e.firstElementChild?.getBoundingClientRect(); return { t: (e.textContent || '').trim(), left: Math.round(r.left), right: Math.round(r.right), align: getComputedStyle(e).textAlign, innerLeft: inner ? Math.round(inner.left) : null, innerRight: inner ? Math.round(inner.right) : null }; }) : [];
    return { th, td, rowH: firstRow ? Math.round(firstRow.getBoundingClientRect().height) : null };
  });

  // --- 5) Satır hover + buton active + focus ring (sevkiyat listesi)
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  const row = page.locator('tbody tr').first();
  const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  await row.hover();
  await page.waitForTimeout(300);
  const after = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  const cursor = await row.evaluate((e) => getComputedStyle(e).cursor);
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return null;
    const cs = getComputedStyle(a);
    return { el: a.tagName + (a.id ? '#' + a.id : '') + ' ' + (a.textContent || '').trim().slice(0, 20), outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor, boxShadow: cs.boxShadow, ring: cs.getPropertyValue('--tw-ring-width') };
  });
  out.interaction = { rowBgBefore: before, rowBgAfter: after, cursor, focus };

  // KPI ondalık tutarlılığı
  out.kpi = await page.evaluate(() => {
    const txt = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0).map((e) => (e.textContent || '').trim()).filter((t) => /₺|€/.test(t));
    return txt.slice(0, 20);
  });

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
