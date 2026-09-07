import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTE = '/arge/projeler/f9b6b6fe-5177-43c2-a96b-b1c435af67d4/receteler';

// arge-recete-31: Miktar sütunundaki sayı sağ kenarı (birim koduna göre)
const FN_QTY = `(() => {
  const main = document.querySelector('main');
  const leaves = Array.from(main.querySelectorAll('*')).filter(e => !e.children.length);
  const qtyTexts = leaves.filter(e => /^[\\d]+,\\d{4}$/.test((e.textContent||'').trim())).map(e => { const r=e.getBoundingClientRect(); return { t:e.textContent.trim(), right:Math.round(r.right*10)/10 }; });
  const qtyInputs = Array.from(main.querySelectorAll('input')).filter(i => /^[\\d]*,?\\d{0,4}$/.test(i.value) && i.value).map(i => { const r=i.getBoundingClientRect(); return { v:i.value, right:Math.round(r.right*10)/10 }; });
  return { qtyTexts, qtyInputs };
})()`;

// arge-recete-32: salt-okunur (v2) satır yükseklikleri
const FN_ROWS = `(() => {
  const rows = Array.from(document.querySelectorAll('[role="row"]')).slice(1); // ilk = başlık
  return rows.map(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height*10)/10, txt: (e.textContent||'').replace(/\\s+/g,' ').slice(0,30) }; });
})()`;

// arge-recete-33: dinlenmede görünür dikdörtgen sayısı (border VEYA saydam-olmayan gölge)
const FN_BOXES = `(() => {
  const main = document.querySelector('main');
  const card = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-xl/.test(c) && /border/.test(c); });
  const res = { borderOnly: 0, shadowOnly: 0, both: 0, total: 0, list: [] };
  if (!card) return res;
  const els = card.querySelectorAll('*');
  for (const e of Array.from(els)) {
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (r.width <= 20 || r.height <= 16) continue;
    const bws = ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k => parseFloat(cs[k]));
    const hasBorder = bws.every(v => v > 0);
    const sh = cs.boxShadow;
    const hasShadow = sh !== 'none' && /rgba?\\((?!0, 0, 0, 0\\))/.test(sh.replace(/rgba\\(0, 0, 0, 0\\)[^,]*,?/g, ''));
    if (hasBorder && hasShadow) res.both++; else if (hasBorder) res.borderOnly++; else if (hasShadow) res.shadowOnly++;
    if (hasBorder || hasShadow) res.list.push({ tag: e.tagName.toLowerCase(), v: (e.value !== undefined ? String(e.value) : (e.textContent||'').trim()).slice(0,14), w: Math.round(r.width), h: Math.round(r.height) });
  }
  res.total = res.borderOnly + res.shadowOnly + res.both;
  return res;
})()`;

// arge-recete-34: kart üstü / ilk malzeme satırı arası krom
const FN_CHROME = `(() => {
  const main = document.querySelector('main');
  const card = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-lg/.test(c) && /border-border\\/60/.test(c) && d.getAttribute('role')==='table'; });
  const cardTop = card ? Math.round(card.getBoundingClientRect().top) : null;
  // Ana kartın (bilgi bandı + maliyet simülasyonu) üst kenarını h2 "v..." elemanından bul
  const h2 = Array.from(main.querySelectorAll('h2')).find(e => /^v\\d/.test((e.textContent||'').trim()));
  const outerTop = h2 ? Math.round(h2.closest('div')?.getBoundingClientRect().top ?? 0) : null;
  const rows = Array.from(document.querySelectorAll('[role="row"]'));
  const firstDataRow = rows[1];
  const firstRowTop = firstDataRow ? Math.round(firstDataRow.getBoundingClientRect().top) : null;
  const viewportH = window.innerHeight;
  const visibleCount = rows.slice(1).filter(r => r.getBoundingClientRect().top < viewportH && r.getBoundingClientRect().bottom <= viewportH).length;
  return { outerTop, cardTop, firstRowTop, chrome: (outerTop!=null && firstRowTop!=null) ? firstRowTop-outerTop : null, totalRows: rows.length-1, visibleCount, docH: document.documentElement.scrollHeight };
})()`;

// arge-recete-35: mobil malzeme kartı yükseklikleri
const FN_MOBILE = `(() => {
  const rows = Array.from(document.querySelectorAll('[role="row"]')).slice(1);
  return { heights: rows.map(e => Math.round(e.getBoundingClientRect().height*10)/10), docH: document.documentElement.scrollHeight };
})()`;

async function main() {
  const browser = await launchBrowser();
  const out: any = {};

  // 1440 salt-okunur (v2, varsayılan açılış)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    out.v2_1440_qty = await page.evaluate(FN_QTY);
    out.v2_1440_rows = await page.evaluate(FN_ROWS);
    out.v2_1440_boxes = await page.evaluate(FN_BOXES);
    out.v2_1440_chrome = await page.evaluate(FN_CHROME);
    await ctx.close();
  }

  // 1440 düzenlenebilir (v1)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    await page.getByRole('button', { name: /^v1/ }).first().click();
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    out.v1_1440_qty = await page.evaluate(FN_QTY);
    out.v1_1440_rows = await page.evaluate(FN_ROWS);
    out.v1_1440_boxes = await page.evaluate(FN_BOXES);
    await ctx.close();
  }

  // 390 salt-okunur (v2)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    out.v2_390_qty = await page.evaluate(FN_QTY);
    out.v2_390_mobile = await page.evaluate(FN_MOBILE);
    out.v2_390_boxes = await page.evaluate(FN_BOXES);
    await ctx.close();
  }

  // 390 düzenlenebilir (v1)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route: ROUTE, as: 'admin' });
    await page.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole('option', { name: /v1/ }).first().click();
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    out.v1_390_qty = await page.evaluate(FN_QTY);
    out.v1_390_mobile = await page.evaluate(FN_MOBILE);
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main();
