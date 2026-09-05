/**
 * Tedarik modülü Tur 2 hedefli ölçüm probu (gorsel-critic).
 * Tur 1'de açılan 15 bulgunun her birini yeniden ölçer (kapat/açık bırak kararı için).
 * Kullanım: tsx scripts/probe-tedarik-r2.ts
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PO_ID = '686dc9f5-5030-42af-a836-313947461a52'; // PO-2026-000003, invoiced (tam zincir)

type Out = Record<string, unknown>;

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' } as const;
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' } as const;

async function main() {
  const browser = await launchBrowser();
  const out: Out = {};

  // --- kritik-stok masaüstü: satır sayısı + filtre varsayılanı (01), boş durum (02)
  {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/kritik-stok', as: 'admin', base });
    out.criticalDesktop = await page.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr');
      const cb = document.querySelector<HTMLElement>('#only-critical');
      const empty = document.querySelector<HTMLElement>('[data-slot="empty-state"], .text-muted-foreground');
      const body = (document.body.textContent ?? '').replace(/\s+/g, ' ');
      return {
        rows: rows.length,
        rowHeights: Array.from(rows).slice(0, 5).map((r) => Math.round(r.getBoundingClientRect().height)),
        onlyCriticalChecked: cb?.getAttribute('aria-checked') ?? cb?.getAttribute('data-state') ?? null,
        countHint: /(\d+)\s*kayıt/.exec(body)?.[0] ?? null,
        rulesHint: /(\d+)\s*kural/.exec(body)?.[0] ?? null,
        emptyVisible: !!document.body.textContent?.includes('Kural tanımlı ürün bulunamadı'),
        filterEmptyVisible: !!document.body.textContent?.includes('Filtreye uyan kural yok'),
        clearFilterBtn: Array.from(document.querySelectorAll('button')).filter((b) => /Filtreyi temizle/.test(b.textContent ?? '')).length,
        _e: empty ? 1 : 0,
      };
    });
    // 02: filtreyi aç -> filtre kaynaklı boşluk metni ve eylemi var mı?
    const cb = page.locator('#only-critical');
    const state = await cb.getAttribute('data-state');
    if (state !== 'checked') await cb.click();
    await page.waitForTimeout(200);
    out.criticalDesktopFiltered = await page.evaluate(() => {
      const body = (document.body.textContent ?? '').replace(/\s+/g, ' ');
      return {
        rows: document.querySelectorAll('tbody tr').length,
        filterEmptyVisible: body.includes('Filtreye uyan kural yok'),
        wrongEmptyVisible: body.includes('Kural tanımlı ürün bulunamadı'),
        clearFilterBtn: Array.from(document.querySelectorAll('button')).filter((b) => /Filtreyi temizle/.test(b.textContent ?? '')).length,
      };
    });
    await ctx.close();
  }

  // --- masaüstü tablo taşması (yeni): DataTable iç kaydırıcısı + son sütunun kırpılması
  for (const [key, route] of [
    ['tableOverflowOrders', '/satin-alma/siparisler'],
    ['tableOverflowCritical', '/satin-alma/kritik-stok'],
  ] as const) {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openRoute(page, { route, as: 'admin', base });
    out[key] = await page.evaluate(() => {
      const table = document.querySelector('table');
      const scroller = table?.closest('div');
      const sr = scroller?.getBoundingClientRect();
      const ths = Array.from(document.querySelectorAll('th')).map((th) => {
        const r = th.getBoundingClientRect();
        return { t: (th.textContent ?? '').trim().slice(0, 20), right: Math.round(r.right), w: Math.round(r.width), clipped: sr ? r.right > sr.right + 1 : false };
      });
      const lastCells = Array.from(document.querySelectorAll('tbody tr')).slice(0, 3).map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const last = tds[tds.length - 1];
        const r = last?.getBoundingClientRect();
        return { t: (last?.textContent ?? '').trim(), right: r ? Math.round(r.right) : null, clipped: sr && r ? r.right > sr.right + 1 : false };
      });
      return {
        scroller: scroller ? { sw: scroller.scrollWidth, cw: scroller.clientWidth, right: Math.round(scroller.getBoundingClientRect().right), overflow: getComputedStyle(scroller).overflowX } : null,
        tableWidth: table ? Math.round(table.getBoundingClientRect().width) : null,
        ths,
        lastCells,
      };
    });
    await ctx.close();
  }

  // --- kritik-stok mobil: onay kutusu dokunma hedefi (03)
  {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/kritik-stok', as: 'admin', base });
    out.criticalMobile = await page.evaluate(() => {
      const cb = document.querySelector<HTMLElement>('#only-critical');
      const label = cb?.closest('label');
      const r = cb?.getBoundingClientRect();
      const lr = label?.getBoundingClientRect();
      return {
        checkbox: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        label: lr ? { w: Math.round(lr.width), h: Math.round(lr.height) } : null,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        cards: document.querySelectorAll('ul > li').length,
      };
    });
    await ctx.close();
  }

  // --- onay kuyruğu mobil: kart taşması (01), buton yüksekliği (02), kalem listesi (03)
  {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/onay-kuyrugu', as: 'admin', base });
    out.approvalMobile = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button, a[data-slot="button"]'))
        .filter((b) => /Onayla|Reddet|Düzenle/.test(b.textContent ?? ''))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { t: (b.textContent ?? '').trim(), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), overflowsViewport: r.right > window.innerWidth };
        });
      const card = btns.length ? (document.querySelector<HTMLElement>('button')?.closest('.rounded-xl') as HTMLElement | null) : null;
      const cr = card?.getBoundingClientRect();
      const lineItems = card ? card.querySelectorAll('ul > li').length : 0;
      return {
        btns,
        card: cr ? { x: Math.round(cr.x), right: Math.round(cr.right), w: Math.round(cr.width) } : null,
        maxBtnRight: btns.length ? Math.max(...btns.map((b) => b.right)) : null,
        minBtnH: btns.length ? Math.min(...btns.map((b) => b.h)) : null,
        lineItemsInFirstCard: lineItems,
        docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      };
    });
    await ctx.close();
  }

  // --- onay kuyruğu masaüstü: kart kalem satırı + kalem sayısı görünürlüğü (03)
  {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/onay-kuyrugu', as: 'admin', base });
    out.approvalDesktop = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.rounded-xl.border'));
      return {
        cards: cards.length,
        perCard: cards.slice(0, 4).map((c) => {
          const r = c.getBoundingClientRect();
          return {
            w: Math.round(r.width),
            h: Math.round(r.height),
            lineRows: c.querySelectorAll('ul > li').length,
            hasKalem: /\d+ kalem/.test(c.textContent ?? ''),
            hasTL: (c.textContent ?? '').includes('₺'),
          };
        }),
      };
    });
    await ctx.close();
  }

  // --- siparişler mobil: kartlarda ₺ metrik (01/02)
  {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/siparisler', as: 'admin', base });
    out.ordersMobile = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('ul > li'));
      return {
        cards: cards.length,
        withTL: cards.filter((c) => (c.textContent ?? '').includes('₺')).length,
        heights: cards.slice(0, 5).map((c) => Math.round(c.getBoundingClientRect().height)),
        firstCardText: (cards[0]?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      };
    });
    await ctx.close();
  }

  // --- PO detay mobil: satır tablosu kart kalıbı (01), toplam bloğu (02)
  {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await openRoute(page, { route: `/satin-alma/siparisler/${PO_ID}`, as: 'admin', base });
    out.poDetailMobile = await page.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
        (el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 100,
      );
      const table = document.querySelector('table');
      const tableVisible = table ? getComputedStyle(table.closest('div')!).display !== 'none' : false;
      const body = (document.body.textContent ?? '').replace(/\s+/g, ' ');
      const totalLabel = Array.from(document.querySelectorAll<HTMLElement>('div')).find((d) => d.textContent?.trim() === 'Toplam');
      const totalVal = totalLabel?.nextElementSibling as HTMLElement | null;
      const cs = totalVal ? getComputedStyle(totalVal) : null;
      const lineCards = Array.from(document.querySelectorAll<HTMLElement>('ul.md\\:hidden > li, ul > li'));
      return {
        innerScrollers: scrollers.map((el) => ({ tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 70), sw: el.scrollWidth, cw: el.clientWidth })),
        tableVisible,
        lineCardCount: lineCards.length,
        lineCardsWithPrice: lineCards.filter((c) => (c.textContent ?? '').includes('₺')).length,
        firstLineCard: (lineCards[0]?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
        totalLabelPresent: !!totalLabel,
        totalStyle: cs ? { size: cs.fontSize, weight: cs.fontWeight, variant: cs.fontVariantNumeric } : null,
        docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
        hasTL: body.includes('₺'),
      };
    });
    await ctx.close();
  }

  // --- PO detay masaüstü
  {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openRoute(page, { route: `/satin-alma/siparisler/${PO_ID}`, as: 'admin', base });
    out.poDetailDesktop = await page.evaluate(() => {
      const totalLabel = Array.from(document.querySelectorAll<HTMLElement>('div')).find((d) => d.textContent?.trim() === 'Toplam');
      const totalVal = totalLabel?.nextElementSibling as HTMLElement | null;
      const cs = totalVal ? getComputedStyle(totalVal) : null;
      const rows = document.querySelectorAll('tbody tr');
      return {
        totalLabelPresent: !!totalLabel,
        totalStyle: cs ? { size: cs.fontSize, weight: cs.fontWeight, variant: cs.fontVariantNumeric, text: totalVal?.textContent?.trim() } : null,
        rows: rows.length,
        rowH: Array.from(rows).slice(0, 4).map((r) => Math.round(r.getBoundingClientRect().height)),
        docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      };
    });
    await ctx.close();
  }

  // --- yeni sipariş masaüstü: başlık kademeleri (02), hairline hizası (03), satır tutarı (01)
  {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/siparisler/yeni', as: 'admin', base });
    out.newOrderDesktop = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2')).map((h) => {
        const cs = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        return { t: h.textContent?.trim(), size: cs.fontSize, weight: cs.fontWeight, transform: cs.textTransform, right: Math.round(r.right) };
      });
      const labels = Array.from(document.querySelectorAll('label')).slice(0, 6).map((l) => {
        const cs = getComputedStyle(l);
        return { t: l.textContent?.trim().slice(0, 20), size: cs.fontSize, weight: cs.fontWeight };
      });
      // bölüm hairline'ı ve alan ızgarası sağ kenarları
      const sections = Array.from(document.querySelectorAll<HTMLElement>('.border-t')).map((s) => ({ cls: s.className.slice(0, 50), right: Math.round(s.getBoundingClientRect().right) }));
      const grid = document.querySelector<HTMLElement>('.max-w-3xl .grid');
      return {
        h2s,
        labels,
        sections: sections.slice(0, 6),
        gridRight: grid ? Math.round(grid.getBoundingClientRect().right) : null,
        docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      };
    });
    await ctx.close();
  }

  // --- tedarikçiler: renk tokenleri (01), birimler (02), etiket sarması (03), etkileşim (04)
  {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/tedarikciler', as: 'admin', base });
    out.suppliersDesktop = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[role="link"]'));
      const pctEls = Array.from(document.querySelectorAll<HTMLElement>('div')).filter((d) => /^%\d+$/.test(d.textContent?.trim() ?? ''));
      const labels = Array.from(document.querySelectorAll<HTMLElement>('.uppercase')).slice(0, 12).map((l) => ({ t: l.textContent?.trim(), size: getComputedStyle(l).fontSize, h: Math.round(l.getBoundingClientRect().height) }));
      const body = (document.body.textContent ?? '');
      return {
        cardCount: cards.length,
        cardHasHoverClass: cards[0]?.className.includes('hover:bg-accent') ?? false,
        cardTabIndex: cards[0]?.getAttribute('tabindex'),
        pctColors: Array.from(new Set(pctEls.map((e) => getComputedStyle(e).color))),
        labels,
        hasLeadTimeEnglish: /LEAD\s*T[İI]ME/i.test(body),
        hasGun: /\d+ gün/.test(body),
        has100: /\/100/.test(body),
        switches: document.querySelectorAll('[role="switch"]').length,
      };
    });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext(MOBILE);
    const page = await ctx.newPage();
    await openRoute(page, { route: '/satin-alma/tedarikciler', as: 'admin', base });
    out.suppliersMobile = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll<HTMLElement>('.uppercase')).map((l) => ({ t: l.textContent?.trim(), h: Math.round(l.getBoundingClientRect().height), lines: Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight || '16')) }));
      const heights = Array.from(new Set(labels.map((l) => l.h)));
      return {
        labels: labels.slice(0, 8),
        distinctLabelHeights: heights,
        docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      };
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
