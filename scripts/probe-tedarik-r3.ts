/** Tur 3 hedefli tedarik probu — ölçüm çıktısı JSON. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PO = '/satin-alma/siparisler/c8a4c249-50db-48e1-9faa-563c400426c3';

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) Kritik stok — Kullanılabilir/Risk dürüstlüğü
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/satin-alma/kritik-stok', as: 'admin' });
    out.critical = await page.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('tbody tr'));
      const rows = trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()));
      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
      const availIdx = headers.findIndex((h) => h.includes('Kullanılabilir'));
      const riskIdx = headers.findIndex((h) => h.includes('Risk'));
      const availZero = rows.filter((r) => r[availIdx] === '0').length;
      const riskNormal = rows.filter((r) => (r[riskIdx] ?? '').includes('Normal')).length;
      const sc = document.querySelector('[data-slot="table-container"], .overflow-x-auto') as HTMLElement | null;
      return { headers, rowCount: rows.length, availZero, riskNormal, sample: rows.slice(0, 3),
        scroller: sc ? { sw: sc.scrollWidth, cw: sc.clientWidth } : null };
    });
    await ctx.close();
  } catch (e) { console.error('BLOK HATASI', String(e).slice(0,200)); }

  // 2) Onay kuyruğu — masaüstü kart genişliği / boş alan
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/satin-alma/onay-kuyrugu', as: 'admin' });
    out.approval = await page.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement | null;
      const card = document.querySelector('main [class*="rounded"][class*="border"]') as HTMLElement | null;
      const li = document.querySelector('main ul > li, main article, main [data-approval-card]') as HTMLElement | null;
      const el = li ?? card;
      const r = el?.getBoundingClientRect();
      const mr = main?.getBoundingClientRect();
      return { cardW: r ? Math.round(r.width) : null, cardH: r ? Math.round(r.height) : null,
        mainW: mr ? Math.round(mr.width) : null, mainH: mr ? Math.round(mr.height) : null,
        ratio: r && mr ? Number((r.width / mr.width).toFixed(2)) : null };
    });
    await ctx.close();
  } catch (e) { console.error('BLOK HATASI', String(e).slice(0,200)); }

  // 3) PO detay — KDV metni
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: PO, as: 'admin' });
    out.poDetail = await page.evaluate(() => {
      const txt = document.body.innerText;
      const vat = Array.from(txt.matchAll(/%\d+[.,]\d+/g)).map((m) => m[0]);
      const dupChain = { chainRefs: Array.from(document.querySelectorAll('a,div')).map((e) => (e.textContent ?? '').trim()).filter((t) => /^(GR|PINV)-\d{4}-\d{6}$/.test(t)) };
      return { vatStrings: vat.slice(0, 6), chainRefs: dupChain.chainRefs };
    });
    await ctx.close();
  } catch (e) { console.error('BLOK HATASI', String(e).slice(0,200)); }

  // 4) Yeni sipariş — hizalama
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/satin-alma/siparisler/yeni', as: 'admin' });
    out.newOrderDesktop = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button,[role="combobox"]')) as HTMLElement[];
      const prod = all.find((e) => (e.textContent ?? '').includes('Ürün ara ve ekle'));
      const sup = all.find((e) => (e.textContent ?? '').includes('Tedarikçi seçin'));
      const formEl = document.querySelector('form') as HTMLElement | null;
      const grid = document.querySelector('form div.grid') as HTMLElement | null;
      return {
        productSelect: prod ? { left: Math.round(prod.getBoundingClientRect().left), right: Math.round(prod.getBoundingClientRect().right), w: Math.round(prod.getBoundingClientRect().width) } : null,
        supplierSelect: sup ? { left: Math.round(sup.getBoundingClientRect().left), right: Math.round(sup.getBoundingClientRect().right), w: Math.round(sup.getBoundingClientRect().width) } : null,
        gridRight: grid ? Math.round(grid.getBoundingClientRect().right) : null,
        formRight: formEl ? Math.round(formEl.getBoundingClientRect().right) : null,
      };
    });
    await ctx.close();
  } catch (e) { console.error('BLOK HATASI', String(e).slice(0,200)); }

  // 5) Yeni sipariş mobil — aksiyon şeridi ve alt gezinme çakışması
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/satin-alma/siparisler/yeni', as: 'admin' });
    out.newOrderMobile = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Sipariş oluştur')) as HTMLElement | undefined;
      const nav = document.querySelector('nav[class*="fixed"], [data-slot="mobile-tabbar"], footer nav') as HTMLElement | null;
      const navs = Array.from(document.querySelectorAll('nav')).map((n) => { const cs = getComputedStyle(n); const r = n.getBoundingClientRect(); return { pos: cs.position, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
      const br = btn?.getBoundingClientRect();
      return { submit: br ? { top: Math.round(br.top), bottom: Math.round(br.bottom), h: Math.round(br.height), w: Math.round(br.width) } : null,
        navBox: nav ? { top: Math.round(nav.getBoundingClientRect().top), bottom: Math.round(nav.getBoundingClientRect().bottom), pos: getComputedStyle(nav).position } : null,
        navs, docH: document.documentElement.scrollHeight, vh: window.innerHeight };
    });
    await ctx.close();
  } catch (e) { console.error('BLOK HATASI', String(e).slice(0,200)); }

  // 6) Tedarikçiler mobil — switch etiketi + ayraç orphan
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/satin-alma/tedarikciler', as: 'admin' });
    out.suppliersMobile = await page.evaluate(() => {
      const sw = Array.from(document.querySelectorAll('[role="switch"], button[data-slot="switch"]')) as HTMLElement[];
      const info = sw.map((s) => {
        const r = s.getBoundingClientRect();
        const label = document.querySelector(`label[for="${s.id}"]`);
        const labelVisible = label ? getComputedStyle(label).display !== 'none' && (label as HTMLElement).offsetParent !== null : false;
        return { id: s.id || null, w: Math.round(r.width), h: Math.round(r.height), ariaLabel: s.getAttribute('aria-label'), ariaLabelledby: s.getAttribute('aria-labelledby'), labelVisible };
      });
      // ayraç orphan: metrik şeridinde satır başında '·'
      const strips = Array.from(document.querySelectorAll('main li, main [role="link"]')) as HTMLElement[];
      const texts = strips.map((s) => (s.innerText ?? '').split('\n').filter(Boolean));
      const orphan = texts.filter((lines) => lines.some((l) => l.trim().startsWith('·'))).length;
      return { switches: info, cards: texts.length, orphanSeparatorCards: orphan, sample: texts.slice(0, 3) };
    });
    await ctx.close();
  } catch (e) { console.error('BLOK HATASI', String(e).slice(0,200)); }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
