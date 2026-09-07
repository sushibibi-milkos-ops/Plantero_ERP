/**
 * Tur 9 — arge modülü kritik ölçümleri (gorsel-critic).
 * Çıktı: artifacts/critic/probe-arge-r9.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const PID = process.env.PID ?? 'c2913daa-05c6-46bc-9f48-942e864a651f';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  const open = async (route: string, w: number, h: number) => {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      isMobile: w < 500,
      hasTouch: w < 500,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
    });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    return { page, ctx };
  };

  // 1) /arge/projeler 1440: ilk satır ofseti (arge-projeler-08 yeniden ölçüm) + birim maliyet renkleri
  {
    const { page, ctx } = await open('/arge/projeler', 1440, 900);
    out.projeler_1440 = await page.evaluate(() => {
      const main = document.querySelector('main');
      const mainTop = main?.getBoundingClientRect().top ?? 0;
      const r = document.querySelector('tbody tr')?.getBoundingClientRect();
      const birim = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const td = tr.querySelectorAll('td')[4];
        const el = (td?.querySelector('*') ?? td) as HTMLElement | null;
        return { t: (td?.textContent ?? '').trim(), color: el ? getComputedStyle(el).color : null };
      });
      return {
        firstRowTop_viewport: r ? +r.top.toFixed(1) : null,
        firstRowTop_mainOffset: r ? +(r.top - mainTop).toFixed(1) : null,
        rowHeight: r ? +r.height.toFixed(1) : null,
        birim,
      };
    });
    await ctx.close();
  }

  // 2) /arge/receteler 1440: ilk satır ofseti + birim maliyet renkleri (arge-receteler-02/03)
  {
    const { page, ctx } = await open('/arge/receteler', 1440, 900);
    out.receteler_1440 = await page.evaluate(() => {
      const main = document.querySelector('main');
      const mainTop = main?.getBoundingClientRect().top ?? 0;
      const r = document.querySelector('tbody tr')?.getBoundingClientRect();
      const heads = Array.from(document.querySelectorAll('thead th')).map((e) => (e.textContent ?? '').trim());
      const idx = heads.findIndex((h) => h.includes('Birim maliyet'));
      const birim = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const td = tr.querySelectorAll('td')[idx];
        const el = (td?.querySelector('*') ?? td) as HTMLElement | null;
        return { t: (td?.textContent ?? '').trim(), color: el ? getComputedStyle(el).color : null };
      });
      return {
        firstRowTop_viewport: r ? +r.top.toFixed(1) : null,
        firstRowTop_mainOffset: r ? +(r.top - mainTop).toFixed(1) : null,
        heads,
        birimIdx: idx,
        birim,
      };
    });
    await ctx.close();
  }

  // 3) /arge/projeler/[id]/receteler 390: üst eylem şeridinin taşması / kırpılması
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/receteler`, 390, 844);
    out.pr_390_actionbar = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const btns = Array.from(document.querySelectorAll('button, a[data-slot="button"]')) as HTMLElement[];
      const clipped = btns
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            label: (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30),
            left: +r.left.toFixed(1),
            right: +r.right.toFixed(1),
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
          };
        })
        .filter((b) => b.w > 0 && b.h > 0 && (b.right > vw + 0.5 || b.left < -0.5));
      // yatay kaydırılabilir kapsayıcılar
      const scrollers = (Array.from(document.querySelectorAll('*')) as HTMLElement[])
        .filter((e) => e.scrollWidth - e.clientWidth > 2 && e.clientWidth > 100)
        .map((e) => ({
          tag: e.tagName.toLowerCase(),
          cls: (e.className ?? '').toString().slice(0, 90),
          sw: e.scrollWidth,
          cw: e.clientWidth,
          overflowX: getComputedStyle(e).overflowX,
          text: (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        }));
      return { vw, clipped, scrollers };
    });

    // Tüm etkileşimli hedeflerin boyutu (mobil)
    out.pr_390_touch = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll('button, a[href], input, select, [role="button"], [tabindex="0"]'),
      ) as HTMLElement[];
      return els
        .map((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return {
            label: (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30),
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
            vis: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
          };
        })
        .filter((e) => e.vis && (e.w < 44 || e.h < 44));
    });
    await ctx.close();
  }

  // 4) /arge/projeler/[id]/board 1440 + 390: kanban kaydırıcı ve kart yükseklikleri
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/board`, 1440, 900);
    out.board_1440 = await page.evaluate(() => {
      const scrollers = (Array.from(document.querySelectorAll('*')) as HTMLElement[])
        .filter((e) => e.scrollWidth - e.clientWidth > 2 && e.clientWidth > 200)
        .map((e) => ({ cls: (e.className ?? '').toString().slice(0, 80), sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX }));
      const cols = Array.from(document.querySelectorAll('[data-kanban-column], [data-column-id]')).map((e) => {
        const r = e.getBoundingClientRect();
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      });
      return { scrollers, cols };
    });
    // klavye odak halkası
    out.board_focus = await (async () => {
      await page.keyboard.press('Tab');
      return page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return null;
        const cs = getComputedStyle(a);
        return { tag: a.tagName, label: (a.textContent ?? '').trim().slice(0, 24), outline: cs.outline, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow.slice(0, 60) };
      });
    })();
    await ctx.close();
  }

  writeFileSync('artifacts/critic/probe-arge-r9.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
