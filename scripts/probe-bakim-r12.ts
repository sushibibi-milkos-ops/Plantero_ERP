import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const RANK: Record<string, number> = { Bildirildi: 0, Planlandı: 1, Yapılıyor: 2, 'Parça bekliyor': 2.5, Tamamlandı: 3, İptal: 4 };
const ORDERS = [
  ['MO-2026-000001', '244a511a-a01c-4837-9021-614cced31af8'],
  ['MO-2026-000002', '90090326-9df2-42b0-a574-90dbf8edf893'],
  ['MO-2026-000003', 'b7b95a47-b758-45d6-8df1-2e98b549d7de'],
  ['MO-2026-000004', '4d13a776-655d-42e7-81f4-dc5bfddbce13'],
  ['MO-2026-000005', '4a9cca52-d4ec-4d48-ae31-4e8912f03da6'],
  ['MO-2026-000006', '4ada5e07-4759-486b-804d-c4325be7fd3f'],
];

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) Zaman çizgisi monotonluk + determinizm (2 geçiş)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
    const page = await ctx.newPage();
    const pass = async () => {
      const res: Array<Record<string, unknown>> = [];
      for (const [docNo, id] of ORDERS) {
        await openRoute(page, { base, route: `/bakim/is-emirleri/${id}`, as: 'admin' });
        const labels = await page.evaluate(() => {
          const ol = document.querySelector('ol.space-y-4');
          if (!ol) return [];
          return Array.from(ol.querySelectorAll('li')).map((li) => (li.querySelector('span.font-medium') as HTMLElement | null)?.innerText.trim() ?? '');
        });
        const ranks = labels.map((l) => RANK[l] ?? -1);
        let monotonic = true;
        for (let i = 1; i < ranks.length; i++) if (ranks[i]! < ranks[i - 1]!) monotonic = false;
        res.push({ docNo, labels, ranks, monotonic });
      }
      return res;
    };
    const p1 = await pass();
    const p2 = await pass();
    out.timelinePass1 = p1;
    out.timelineDeterministic = JSON.stringify(p1) === JSON.stringify(p2);
    out.timelineAllMonotonic = p1.every((r) => r.monotonic === true);
    await ctx.close();
  }

  // 2) KPI şeridi @390 — oee + makineler
  for (const [key, route] of [['oeeKpi390', '/bakim/oee'], ['makinelerKpi390', '/bakim/makineler']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    out[key] = await page.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll('div')).filter((d) => d.scrollWidth > d.clientWidth + 4 && d.clientWidth > 200);
      const detail = scrollers.map((d) => {
        const kids = Array.from(d.children) as HTMLElement[];
        const dr = d.getBoundingClientRect();
        const fullyVisible = kids.filter((k) => { const r = k.getBoundingClientRect(); return r.left >= dr.left - 1 && r.right <= dr.right + 1; }).length;
        return { sw: d.scrollWidth, cw: d.clientWidth, kids: kids.length, fullyVisible, cls: d.className.slice(0, 110), text: (d as HTMLElement).innerText.slice(0, 90).replace(/\n/g, '/') };
      });
      // ayrıca kpi ızgarası var mı?
      const grids = Array.from(document.querySelectorAll('div')).filter((d) => /grid/.test(getComputedStyle(d).display) && d.className.includes('kpi'));
      return { scrollers: detail, kpiGrids: grids.map((g) => ({ cols: getComputedStyle(g).gridTemplateColumns, cls: g.className.slice(0, 90) })) };
    });
    await ctx.close();
  }

  // 3) İş emri detay @390 — checkbox/link durumu
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/bakim/is-emirleri/${ORDERS[4]![1]}`, as: 'admin' });
    out.checklist = await page.evaluate(() => Array.from(document.querySelectorAll('button[data-slot="checkbox"]')).map((b) => {
      const r = b.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), disabled: (b as HTMLButtonElement).disabled, pe: getComputedStyle(b).pointerEvents };
    }));
    out.inlineLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a')).filter((a) => { const r = a.getBoundingClientRect(); return r.height > 0 && r.height < 44; }).map((a) => ({ t: a.textContent?.trim().slice(0, 30), h: +a.getBoundingClientRect().height.toFixed(1), display: getComputedStyle(a).display })));
    await ctx.close();
  }

  // 4) yeni @390 — gizli select gerçek mi
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/is-emirleri/yeni', as: 'admin' });
    out.hiddenSelects = await page.evaluate(() => Array.from(document.querySelectorAll('select')).map((s) => {
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s);
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), opacity: cs.opacity, position: cs.position, ariaHidden: s.getAttribute('aria-hidden'), tabIndex: s.tabIndex };
    }));
    out.formControls = await page.evaluate(() => Array.from(document.querySelectorAll('button,input,textarea,[role="combobox"]')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((e) => ({ tag: e.tagName.toLowerCase(), t: (e.textContent ?? (e as HTMLInputElement).placeholder ?? '').trim().slice(0, 24), h: +e.getBoundingClientRect().height.toFixed(1) })).filter((e) => e.h < 44));
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
