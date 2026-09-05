/**
 * Tedarik modülü Tur 1 hedefli ölçüm probu (gorsel-critic).
 * İç kapsayıcı taşmaları, kırpılan aksiyonlar, satır yükseklikleri, hover/transition CSS'i.
 * Kullanım: tsx scripts/probe-tedarik-r1.ts
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PO_ID = '04019b27-9b1c-4098-974a-e94d4d05929e';

type Out = Record<string, unknown>;

async function main() {
  const browser = await launchBrowser();
  const out: Out = {};

  // 1) PO detay — mobilde satırlar tablosu iç taşma
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { route: `/satin-alma/siparisler/${PO_ID}`, as: 'admin', base });
    out.poDetailMobile = await page.evaluate(() => {
      const res: Record<string, unknown> = {};
      const scrollers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
        (el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 100,
      );
      res.innerScrollers = scrollers.map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: el.className?.toString().slice(0, 90),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      }));
      const table = document.querySelector('table');
      if (table) {
        const ths = Array.from(table.querySelectorAll('th'));
        res.tableHeaders = ths.map((th) => {
          const r = th.getBoundingClientRect();
          return { t: (th.textContent ?? '').trim(), x: Math.round(r.x), right: Math.round(r.right), visible: r.right <= window.innerWidth };
        });
        res.tableScroll = { sw: table.scrollWidth, ow: table.getBoundingClientRect().width, vw: window.innerWidth };
        res.thTransform = ths[0] ? getComputedStyle(ths[0]).textTransform : null;
      }
      return res;
    });
    await ctx.close();
  }

  // 2) Onay kuyruğu — mobilde aksiyon butonları kart dışına taşıyor mu
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/onay-kuyrugu', as: 'admin', base });
    out.approvalMobile = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid], article, li, section');
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button, a[data-slot="button"]'))
        .filter((b) => /Onayla|Reddet|Düzenle/.test(b.textContent ?? ''))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { t: (b.textContent ?? '').trim(), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), overflowsViewport: r.right > window.innerWidth };
        });
      // Kartın kutusunu, Onayla butonunun en yakın border'lı atasından bul
      let cardBox: unknown = null;
      const approve = Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) => /Onayla/.test(b.textContent ?? ''));
      if (approve) {
        let el: HTMLElement | null = approve;
        while (el) {
          const cs = getComputedStyle(el);
          if (parseFloat(cs.borderTopWidth) > 0 && el.getBoundingClientRect().width > 200) {
            const r = el.getBoundingClientRect();
            cardBox = { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), overflowHidden: cs.overflowX };
            break;
          }
          el = el.parentElement;
        }
      }
      return { btns, cardBox, vw: window.innerWidth, cardTag: card?.tagName };
    });
    await ctx.close();
  }

  // 3) Siparişler — vurgulu satır, badge renkleri, transition
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/siparisler', as: 'admin', base });
    out.ordersDesktop = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('tbody tr'));
      const bgs = rows.map((r) => getComputedStyle(r).backgroundColor);
      const counts: Record<string, number> = {};
      for (const b of bgs) counts[b] = (counts[b] ?? 0) + 1;
      const badges = Array.from(document.querySelectorAll<HTMLElement>('tbody [data-slot="badge"], tbody span'))
        .filter((s) => /Faturalandı|Onay bekliyor|Tedarikçiye gönderildi|Taslak|Kısmi/.test(s.textContent ?? ''))
        .map((s) => ({ t: (s.textContent ?? '').trim(), color: getComputedStyle(s).color, bg: getComputedStyle(s).backgroundColor }));
      const uniqBadge = Array.from(new Set(badges.map((b) => `${b.t}|${b.color}|${b.bg}`)));
      // tabular-nums kontrolü
      const money = Array.from(document.querySelectorAll<HTMLElement>('tbody td')).filter((td) => /₺/.test(td.textContent ?? ''));
      const fvn = money.slice(0, 3).map((td) => ({ t: (td.textContent ?? '').trim(), fvn: getComputedStyle(td).fontVariantNumeric, align: getComputedStyle(td).textAlign }));
      const pct = Array.from(document.querySelectorAll<HTMLElement>('tbody td')).filter((td) => /^%\d/.test((td.textContent ?? '').trim()));
      return {
        rowBgCounts: counts,
        badgeVariants: uniqBadge,
        badgeCount: badges.length,
        moneyCells: fvn,
        pctCells: pct.slice(0, 2).map((td) => ({ t: (td.textContent ?? '').trim(), fvn: getComputedStyle(td).fontVariantNumeric, align: getComputedStyle(td).textAlign })),
      };
    });
    await ctx.close();
  }

  // 4) Kritik stok — varsayılan filtre nedeniyle boş tablo
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/kritik-stok', as: 'admin', base });
    out.criticalDesktop = await page.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr').length;
      const cb = document.querySelector<HTMLElement>('#only-critical');
      const empty = (document.body.textContent ?? '').match(/Kritik stok kuralı yok[^.]*\./)?.[0] ?? null;
      const count = (document.body.textContent ?? '').match(/\d+ kayıt/)?.[0] ?? null;
      const rulesHint = (document.body.textContent ?? '').match(/\d+ kural/)?.[0] ?? null;
      const emptyActions = Array.from(document.querySelectorAll('button, a')).filter((b) => /Filtre|temizle|Tümünü/.test(b.textContent ?? '')).length;
      const r = cb?.getBoundingClientRect();
      return { rows, checkbox: cb ? { checked: cb.getAttribute('data-state') ?? cb.getAttribute('aria-checked'), w: Math.round(r!.width), h: Math.round(r!.height) } : null, empty, count, rulesHint, emptyActions };
    });
    await ctx.close();
  }

  // 5) Tedarikçiler — metrik hizası, birimler
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/tedarikciler', as: 'admin', base });
    out.suppliersDesktop = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter((el) => el.children.length === 0 && /LEAD|KAL[İI]TE|ZAMANINDA|ÜRÜN/i.test(el.textContent ?? ''))
        .slice(0, 8)
        .map((el) => ({ t: (el.textContent ?? '').trim(), size: getComputedStyle(el).fontSize, tt: getComputedStyle(el).textTransform, align: getComputedStyle(el).textAlign }));
      const red = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter((el) => el.children.length === 0 && /^%\d+$/.test((el.textContent ?? '').trim()))
        .map((el) => ({ t: (el.textContent ?? '').trim(), color: getComputedStyle(el).color }));
      const switches = document.querySelectorAll('[role="switch"], button[data-slot="switch"]').length;
      return { labels, pctColors: red, switches };
    });
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
