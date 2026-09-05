/** Tur 4 hedefli tedarik probu — ölçüm çıktısı JSON (kritik: boş hücre oranı, tabular-nums, hover/focus, renk). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PO = '/satin-alma/siparisler/50e00f08-c2e3-43d1-88b3-28d34927f23f';

async function open(browser: Awaited<ReturnType<typeof launchBrowser>>, route: string, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'satin_alma' });
  return { ctx, page };
}

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) Kritik stok — boş hücre oranı + tabular-nums + satır hover
  try {
    const { ctx, page } = await open(browser, '/satin-alma/kritik-stok');
    out.critical = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const rows = trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()));
      const perCol: Record<string, { dash: number; unknown: number; total: number }> = {};
      headers.forEach((h, i) => {
        const vals = rows.map((r) => r[i] ?? '');
        perCol[h || `col${i}`] = {
          dash: vals.filter((v) => v === '—' || v === '-').length,
          unknown: vals.filter((v) => v.includes('Değerlendirilmedi')).length,
          total: vals.length,
        };
      });
      const numericCell = trs[0]?.querySelectorAll('td')[4] as HTMLElement | undefined;
      const tn = numericCell ? getComputedStyle(numericCell).fontVariantNumeric : null;
      const kpi = Array.from(document.querySelectorAll('main *')).filter((e) => /Kritik|Uyarı|Toplam kural/.test(e.textContent ?? '') && e.children.length === 0).slice(0, 8).map((e) => (e.textContent ?? '').trim());
      return { headers, rowCount: rows.length, perCol, tabularNums: tn, kpiTexts: kpi };
    });
    // satır hover
    const firstRow = page.locator('tbody tr').first();
    const before = await firstRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    await firstRow.hover();
    await page.waitForTimeout(200);
    const after = await firstRow.evaluate((el) => getComputedStyle(el).backgroundColor);
    // focus ring
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow.slice(0, 80) };
    });
    (out.critical as Record<string, unknown>).rowHover = { before, after, changed: before !== after };
    (out.critical as Record<string, unknown>).firstFocus = focus;
    await ctx.close();
  } catch (e) { console.error('kritik-stok', String(e).slice(0, 300)); }

  // 2) Siparişler — boş başlıklı sütun + tabular-nums + hover
  try {
    const { ctx, page } = await open(browser, '/satin-alma/siparisler');
    out.orders = await page.evaluate(() => {
      const ths = Array.from(document.querySelectorAll('thead th'));
      const headers = ths.map((th) => (th.textContent ?? '').trim());
      const emptyHeaders = headers.map((h, i) => ({ i, h })).filter((x) => x.h === '');
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const amountIdx = headers.findIndex((h) => h.includes('Tutar'));
      const amountCells = trs.map((tr) => (tr.querySelectorAll('td')[amountIdx]?.textContent ?? '').trim());
      const cs = trs[0] ? getComputedStyle(trs[0].querySelectorAll('td')[amountIdx] as HTMLElement) : null;
      // boş başlıklı sütunun hücre içerikleri
      const emptyColCells = emptyHeaders.map((x) => ({ i: x.i, vals: trs.map((tr) => (tr.querySelectorAll('td')[x.i]?.innerHTML ?? '').trim().length) }));
      return { headers, emptyHeaders, amountCells, amountAlign: cs?.textAlign, amountTabular: cs?.fontVariantNumeric, emptyColCells };
    });
    const r = page.locator('tbody tr').first();
    const b = await r.evaluate((el) => getComputedStyle(el).backgroundColor);
    await r.hover(); await page.waitForTimeout(200);
    const a = await r.evaluate((el) => getComputedStyle(el).backgroundColor);
    (out.orders as Record<string, unknown>).rowHover = { before: b, after: a, changed: b !== a };
    await ctx.close();
  } catch (e) { console.error('siparisler', String(e).slice(0, 300)); }

  // 3) PO detay — KDV formatı + boş sütun + hizalama
  try {
    const { ctx, page } = await open(browser, PO);
    out.poDetail = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const rows = trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()));
      const perCol: Record<string, { dash: number; total: number }> = {};
      headers.forEach((h, i) => {
        const vals = rows.map((r) => r[i] ?? '');
        perCol[h || `col${i}`] = { dash: vals.filter((v) => v === '—').length, total: vals.length };
      });
      const rawVat = (document.body.innerText.match(/%\d+[.,]\d{3,}/g) ?? []).length;
      const summary = Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0 && /Ara toplam|Genel toplam|KDV$/.test((e.textContent ?? '').trim())).map((e) => (e.textContent ?? '').trim());
      return { headers, rows, perCol, rawVatMatches: rawVat, summary };
    });
    await ctx.close();
  } catch (e) { console.error('po-detay', String(e).slice(0, 300)); }

  // 4) Tedarikçiler mobil — ayraç satır başı + switch adı + kart yüksekliği
  try {
    const { ctx, page } = await open(browser, '/satin-alma/tedarikciler', 390, 844);
    out.suppliersMobile = await page.evaluate(() => {
      const switches = Array.from(document.querySelectorAll('[role="switch"]')) as HTMLElement[];
      const sw = switches.map((s) => ({ aria: s.getAttribute('aria-label'), w: Math.round(s.getBoundingClientRect().width), h: Math.round(s.getBoundingClientRect().height) }));
      // metrik şeridi: her kartta ilk satırdaki en soldaki eleman '·' ile mi başlıyor?
      const strips = Array.from(document.querySelectorAll('main [class*="flex-wrap"]')) as HTMLElement[];
      const orphan = strips.map((strip) => {
        const kids = Array.from(strip.children) as HTMLElement[];
        if (!kids.length) return null;
        const lines = new Map<number, HTMLElement[]>();
        kids.forEach((k) => { const t = Math.round(k.getBoundingClientRect().top); if (!lines.has(t)) lines.set(t, []); lines.get(t)!.push(k); });
        const arr = Array.from(lines.entries()).sort((a, b) => a[0] - b[0]);
        return arr.slice(1).map(([, els]) => (els[0]?.textContent ?? '').trim().slice(0, 12));
      }).filter(Boolean);
      return { switches: sw, wrappedLineFirstTexts: orphan };
    });
    await ctx.close();
  } catch (e) { console.error('tedarikciler', String(e).slice(0, 300)); }

  // 5) Onay kuyruğu — kart genişliği + buton focus ring + yeşil kullanım
  try {
    const { ctx, page } = await open(browser, '/satin-alma/onay-kuyrugu');
    out.approval = await page.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement;
      const card = document.querySelector('main li, main article, main [class*="rounded-lg"][class*="border"]') as HTMLElement | null;
      const cs = card ? getComputedStyle(card) : null;
      const link = Array.from(document.querySelectorAll('main a')).find((a) => /PO-\d/.test(a.textContent ?? '')) as HTMLElement | undefined;
      const lr = link?.getBoundingClientRect();
      return {
        mainW: Math.round(main.getBoundingClientRect().width),
        cardW: card ? Math.round(card.getBoundingClientRect().width) : null,
        cardBorder: cs?.borderColor, cardBg: cs?.backgroundColor,
        poLink: lr ? { w: Math.round(lr.width), h: Math.round(lr.height) } : null,
      };
    });
    await ctx.close();
  } catch (e) { console.error('onay', String(e).slice(0, 300)); }

  // 6) Onay kuyruğu mobil — PO link dokunma hedefi
  try {
    const { ctx, page } = await open(browser, '/satin-alma/onay-kuyrugu', 390, 844);
    out.approvalMobile = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('main a')).find((a) => /PO-\d/.test(a.textContent ?? '')) as HTMLElement | undefined;
      const r = link?.getBoundingClientRect();
      const btns = Array.from(document.querySelectorAll('main button, main a[class*="inline-flex"]')).map((b) => {
        const bb = b.getBoundingClientRect();
        return { t: (b.textContent ?? '').trim().slice(0, 12), w: Math.round(bb.width), h: Math.round(bb.height) };
      });
      return { poLink: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null, btns };
    });
    await ctx.close();
  } catch (e) { console.error('onay mobil', String(e).slice(0, 300)); }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
