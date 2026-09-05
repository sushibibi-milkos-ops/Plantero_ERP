/** Tur 5 (düzeltme turu) doğrulama probu — Tur 4'te açılan tedarik bulgularının kabul ölçümleri. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();

async function open(browser: Awaited<ReturnType<typeof launchBrowser>>, route: string, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'satin_alma' });
  return { ctx, page };
}

/** main içindeki görünür (rect>0) yaprak elemanların font-size/weight dağılımı. */
async function fontSizes(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0 && (e.textContent ?? '').trim().length > 0);
    const sizes = new Map<string, number>();
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(e);
      const key = `${Math.round(parseFloat(cs.fontSize))}/${cs.fontWeight}`;
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    const pureSizes = new Set(Array.from(sizes.keys()).map((k) => k.split('/')[0]));
    return { pairs: Object.fromEntries(sizes), pureSizeCount: pureSizes.size, pureSizes: Array.from(pureSizes).sort((a, b) => Number(b) - Number(a)) };
  });
}

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) kritik-stok — satır hover (tedarik-kritik-stok-07) + Kullanılabilir/Risk dolgu oranı (tedarik-kritik-stok-08)
  try {
    const { ctx, page } = await open(browser, '/satin-alma/kritik-stok');
    const firstRow = page.locator('tbody tr').first();
    const before = await firstRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    await firstRow.hover();
    await page.waitForTimeout(200);
    const after = await firstRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    const cursor = await firstRow.evaluate((el) => getComputedStyle(el).cursor);
    const perCol = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const rows = trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()));
      const availIdx = headers.indexOf('Kullanılabilir');
      const riskIdx = headers.indexOf('Risk');
      const availVals = rows.map((r) => r[availIdx] ?? '');
      const riskVals = rows.map((r) => r[riskIdx] ?? '');
      return {
        rowCount: rows.length,
        availableDash: availVals.filter((v) => v === '—').length,
        availableFilled: availVals.filter((v) => v !== '—' && v !== '').length,
        riskUnknown: riskVals.filter((v) => v === 'Değerlendirilmedi').length,
        riskNormalZero: riskVals.filter((v) => v === 'Normal' || v === '0').length,
      };
    });
    out.critical = { rowHover: { before, after, changed: before !== after }, cursor, perCol };
    await ctx.close();
  } catch (e) { console.error('kritik-stok', String(e).slice(0, 400)); }

  // 2) onay-kuyrugu — --primary rol sayısı + font boyutu + touch target (masaüstü + mobil)
  try {
    const { ctx, page } = await open(browser, '/satin-alma/onay-kuyrugu');
    const primaryRoles = await page.evaluate(() => {
      const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      const rgbOf = (() => {
        const probe = document.createElement('span');
        probe.style.color = `oklch(${primary})`;
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        return rgb;
      })();
      const els = Array.from(document.querySelectorAll('main *'));
      const roles: string[] = [];
      for (const e of els) {
        const cs = getComputedStyle(e);
        if (cs.color === rgbOf) roles.push(`color:${e.tagName}.${(e.className || '').toString().slice(0, 30)}`);
        if (cs.backgroundColor === rgbOf) roles.push(`bg:${e.tagName}.${(e.className || '').toString().slice(0, 30)}`);
      }
      return roles;
    });
    const fonts = await fontSizes(page);
    out.approval = { primaryRoleCount: primaryRoles.length, primaryRoles, fonts };
    await ctx.close();
  } catch (e) { console.error('onay', String(e).slice(0, 400)); }

  try {
    const { ctx, page } = await open(browser, '/satin-alma/onay-kuyrugu', 390, 844);
    const poLink = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('main a')).find((a) => /PO-\d/.test(a.textContent ?? '')) as HTMLElement | undefined;
      const r = link?.getBoundingClientRect();
      return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
    });
    out.approvalMobile = { poLink };
    await ctx.close();
  } catch (e) { console.error('onay mobil', String(e).slice(0, 400)); }

  // 3) siparişler — boş başlıklı sütun kalktı mı + tabular-nums tarih
  try {
    const { ctx, page } = await open(browser, '/satin-alma/siparisler');
    out.orders = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
      const emptyHeaders = headers.filter((h) => h === '');
      const dateCells = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const cell = tds.find((td) => /^\d{2}\.\d{2}\.\d{4}$/.test((td.textContent ?? '').trim()));
        return cell ? getComputedStyle(cell.querySelector('span') ?? cell).fontVariantNumeric : null;
      });
      return { headers, emptyHeaderCount: emptyHeaders.length, dateCells };
    });
    await ctx.close();
  } catch (e) { console.error('siparisler', String(e).slice(0, 400)); }

  // 4) po-detay — font boyutu sayısı + Beklenen tarih sütunu gizli mi + mobil GR touch target
  const [{ rows: poRows }] = [{ rows: [] as string[] }];
  void poRows;
  try {
    const poId = process.env.PROBE_PO_ID;
    if (!poId) throw new Error('PROBE_PO_ID env değişkeni gerekli');
    const { ctx, page } = await open(browser, `/satin-alma/siparisler/${poId}`);
    const fonts = await fontSizes(page);
    const hasExpectedCol = await page.evaluate(() => Array.from(document.querySelectorAll('thead th')).some((th) => (th.textContent ?? '').trim() === 'Beklenen tarih'));
    out.poDetail = { fonts, hasExpectedCol };
    await ctx.close();
  } catch (e) { console.error('po-detay', String(e).slice(0, 400)); }

  try {
    const poId = process.env.PROBE_PO_ID;
    if (!poId) throw new Error('PROBE_PO_ID env değişkeni gerekli');
    const { ctx, page } = await open(browser, `/satin-alma/siparisler/${poId}`, 390, 844);
    const grLink = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('main a')).find((a) => /GR-\d/.test(a.textContent ?? '')) as HTMLElement | undefined;
      const r = link?.getBoundingClientRect();
      return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
    });
    out.poDetailMobile = { grLink };
    await ctx.close();
  } catch (e) { console.error('po-detay mobil', String(e).slice(0, 400)); }

  // 5) siparişler/yeni — boş durum eylemi
  try {
    const { ctx, page } = await open(browser, '/satin-alma/siparisler/yeni');
    const emptyAction = await page.evaluate(() => {
      const empty = Array.from(document.querySelectorAll('main *')).find((e) => (e.textContent ?? '').includes('Henüz satır yok'));
      const container = empty?.closest('div');
      const btns = container ? container.querySelectorAll('button, a[data-slot="button"]').length : 0;
      return { found: Boolean(empty), btns };
    });
    // dokunma hedefi
    const btnBox = await page.locator('text=Ürün ekle').first().boundingBox().catch(() => null);
    out.newOrderEmpty = { emptyAction, addButtonBox: btnBox };
    await ctx.close();
  } catch (e) { console.error('yeni', String(e).slice(0, 400)); }

  // 6) tedarikciler — toolbar + satır yüksekliği + sıralı boyut sayısı
  try {
    const { ctx, page } = await open(browser, '/satin-alma/tedarikciler');
    const toolbar = await page.evaluate(() => {
      const search = document.querySelector('input[aria-label="Tabloda ara"], input[placeholder*="ara"]') as HTMLElement | null;
      const rowH = (document.querySelector('tbody tr') as HTMLElement | null)?.getBoundingClientRect().height ?? null;
      const rowCount = document.querySelectorAll('tbody tr').length;
      return { hasSearch: Boolean(search), rowHeight: rowH ? Math.round(rowH) : null, rowCount };
    });
    const fonts = await fontSizes(page);
    out.suppliers = { toolbar, fonts };
    await ctx.close();
  } catch (e) { console.error('tedarikciler', String(e).slice(0, 400)); }

  try {
    const { ctx, page } = await open(browser, '/satin-alma/tedarikciler', 390, 844);
    const mobileCheck = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('main li'));
      const firstCharIsDot = cards.map((c) => {
        const secondLine = c.querySelector('.mobile-card-subtitle-row');
        const t = (secondLine?.textContent ?? '').trim();
        return t.startsWith('·');
      });
      return { cardCount: cards.length, firstCharIsDot };
    });
    out.suppliersMobile = mobileCheck;
    await ctx.close();
  } catch (e) { console.error('tedarikciler mobil', String(e).slice(0, 400)); }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
