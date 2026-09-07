/** Tur 10 kritik ölçümleri (ar-ge). Çıktı: tek satır JSON. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // --- 1440: liste rotaları — ilk satır ofseti
  for (const [key, route] of [
    ['projeler', '/arge/projeler'],
    ['receteler', '/arge/receteler'],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    out[`${key}_1440`] = await page.evaluate(() => {
      const main = document.querySelector('main');
      const row = document.querySelector('tbody tr');
      const mr = main?.getBoundingClientRect();
      const rr = row?.getBoundingClientRect();
      const money = [...document.querySelectorAll('tbody tr td')]
        .filter((td) => /₺/.test(td.textContent ?? ''))
        .map((td) => {
          const el = (td.querySelector('span,div') as HTMLElement) ?? (td as HTMLElement);
          const cs = getComputedStyle(el);
          return { t: (td.textContent ?? '').trim(), color: cs.color, fvn: cs.fontVariantNumeric, align: getComputedStyle(td as HTMLElement).textAlign };
        });
      return {
        firstRowTop_viewport: rr ? Math.round(rr.top) : null,
        firstRowTop_mainOffset: rr && mr ? Math.round(rr.top - mr.top) : null,
        money,
      };
    });
    await ctx.close();
  }

  // --- 1440: reçete detay — satır kontrollerinin rest kenarlıkları
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    out.precete_1440 = await page.evaluate(() => {
      const pickers = [...document.querySelectorAll('button[data-slot="popover-trigger"]')] as HTMLElement[];
      const borders = pickers.map((b) => {
        const cs = getComputedStyle(b);
        return {
          text: (b.textContent ?? '').trim().slice(0, 20),
          borderWidth: cs.borderTopWidth,
          borderColor: cs.borderTopColor,
          boxShadow: cs.boxShadow.slice(0, 60),
          isActive: document.activeElement === b,
        };
      });
      // sağa hizalı sayı sütunlarında başlık/değer sağ kenarları
      const rects = [...document.querySelectorAll('input[data-slot="input"]')].map((i) => {
        const r = (i as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(i as HTMLElement);
        return { v: (i as HTMLInputElement).value, right: Math.round(r.right), align: cs.textAlign, fvn: cs.fontVariantNumeric };
      });
      const roMoney = [...document.querySelectorAll('span,div')]
        .filter((e) => /^₺[\d.,]+$/.test((e.textContent ?? '').trim()) && e.children.length === 0)
        .map((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e as HTMLElement);
          return { t: (e.textContent ?? '').trim(), right: Math.round(r.right), cy: Math.round(r.top + r.height / 2), fvn: cs.fontVariantNumeric, color: cs.color };
        });
      return { borders, inputs: rects, roMoney, activeEl: document.activeElement?.tagName + ':' + (document.activeElement?.textContent ?? '').trim().slice(0, 20) };
    });
    await ctx.close();
  }

  // --- 390: reçete detay — eylem şeridi + satır dikey hizası
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    out.precete_390 = await page.evaluate(() => {
      const doc = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
      // eylem şeridi: versiyon seçici ile aynı satırdaki kapsayıcı
      const trigger = document.querySelector('button[data-slot="select-trigger"]') as HTMLElement | null;
      const strip = trigger?.parentElement as HTMLElement | null;
      const stripInfo = strip
        ? {
            sw: strip.scrollWidth,
            cw: strip.clientWidth,
            children: [...strip.children].map((c) => {
              const r = (c as HTMLElement).getBoundingClientRect();
              return {
                label: (c as HTMLElement).getAttribute('aria-label') ?? (c.textContent ?? '').trim().slice(0, 20),
                w: Math.round(r.width),
                h: Math.round(r.height),
                right: Math.round(r.right),
                clippedPx: Math.round(Math.max(0, r.right - strip.getBoundingClientRect().right)),
              };
            }),
          }
        : null;
      // satır içi: miktar metni ile birim maliyet metninin dikey merkezi
      const rowsInfo = [...document.querySelectorAll('[data-testid="recipe-line"], [role="row"]')].map((r) => {
        const el = r as HTMLElement;
        const texts = [...el.querySelectorAll('*')]
          .filter((e) => e.children.length === 0 && (e.textContent ?? '').trim())
          .map((e) => {
            const rr = e.getBoundingClientRect();
            return { t: (e.textContent ?? '').trim().slice(0, 14), cy: Math.round(rr.top + rr.height / 2), h: Math.round(rr.height) };
          });
        return { row: (el.textContent ?? '').trim().slice(0, 18), texts };
      });
      // ikon-only butonlar
      const iconBtns = [...document.querySelectorAll('button')]
        .filter((b) => !((b.textContent ?? '').trim()) && (b as HTMLElement).offsetParent !== null)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { label: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
        });
      return { doc, stripInfo, rowsInfo, iconBtns };
    });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
