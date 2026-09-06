/**
 * Tur 6 (kritik) kokpit ölçüm probu — docs/DESIGN-SCORECARD.md kural 6 eki.
 *   tsx scripts/probe-kokpit-r6.ts --as admin --viewport 1440x900
 * Ölçtükleri: (a) çok satırlı liste satırı yükseklikleri (bölüm bazında, distinct küme),
 * (b) boş durum anatomisi (ikon/başlık/açıklama/eylem var mı, yükseklik),
 * (c) KPI/şerit başlığı kırpılması (scrollW > clientW), (d) katlama üstü BİLGİ birimi sayısı
 * (li satırı + şerit hücresi + tek başına metrik satırı), (e) bölüm ilk-ekran dolgu oranı.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

function parseArgs(argv: string[]) {
  let as = 'admin';
  let vp = { width: 1440, height: 900 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--as') as = argv[++i]!;
    else if (a === '--viewport') { const m = /^(\d+)x(\d+)$/.exec(argv[++i]!)!; vp = { width: Number(m[1]), height: Number(m[2]) }; }
  }
  return { as, vp, base: defaultBaseUrl(), route: '/kokpit' };
}

const probe = () => {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main') ?? document.body;
  const vis = (el: Element) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

  // (a) liste satırı yükseklikleri: bölüm + alt satır sayısı
  const rows: Array<{ section: string; h: number; lines: number; tag: string }> = [];
  for (const li of Array.from(main.querySelectorAll<HTMLElement>('li')).filter(vis)) {
    const inner = (li.firstElementChild as HTMLElement) ?? li;
    const sec = txt(li.closest('section')?.querySelector('h2,h3') ?? null);
    const h = r1(inner.getBoundingClientRect().height);
    // görünür alt satır sayısı: farklı `top` değerine sahip yaprak metin kutuları
    const tops = new Set(Array.from(li.querySelectorAll<HTMLElement>('*'))
      .filter((e) => vis(e) && e.children.length === 0 && txt(e).length > 0)
      .map((e) => Math.round(e.getBoundingClientRect().top)));
    rows.push({ section: sec, h, lines: tops.size, tag: inner.tagName.toLowerCase() });
  }
  const bySection: Record<string, { h: number[]; lines: number[] }> = {};
  for (const r of rows) { (bySection[r.section] ||= { h: [], lines: [] }); bySection[r.section]!.h.push(r.h); bySection[r.section]!.lines.push(r.lines); }

  // (b) boş durum anatomisi
  const empties = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis).map((s) => {
    const e = Array.from(s.querySelectorAll<HTMLElement>('div')).find((d) => vis(d) && /py-10|py-16/.test(d.className || ''));
    if (!e) return null;
    const leaves = Array.from(e.querySelectorAll<HTMLElement>('*')).filter((k) => vis(k) && k.children.length === 0 && txt(k).length > 0);
    return {
      section: txt(s.querySelector('h2,h3')), h: Math.round(e.getBoundingClientRect().height),
      sectionH: Math.round(s.getBoundingClientRect().height),
      icon: !!e.querySelector('svg'), textLines: leaves.length,
      texts: leaves.map((k) => txt(k).slice(0, 40)),
      action: !!e.querySelector('a[href],button'),
    };
  }).filter(Boolean);

  // (c) kırpılan metinler (scrollW > clientW), özellikle KPI başlıkları
  const clipped = Array.from(main.querySelectorAll<HTMLElement>('*')).filter(vis)
    .filter((el) => el.children.length === 0 && txt(el).length > 0 && el.scrollWidth - el.clientWidth > 1)
    .map((el) => ({ text: txt(el).slice(0, 44), clientW: el.clientWidth, scrollW: el.scrollWidth, cls: (el.className || '').slice(0, 50) }));

  // (d) katlama üstü BİLGİ birimi: li satırı + şerit hücresi + etiket/değer çifti
  const vh = window.innerHeight;
  const above = (el: Element) => el.getBoundingClientRect().top < vh;
  const liAbove = Array.from(main.querySelectorAll<HTMLElement>('li')).filter((e) => vis(e) && above(e)).length;
  const cellAbove = Array.from(main.querySelectorAll<HTMLElement>('.divide-x > *, [data-slot="stat-strip"] > *')).filter((e) => vis(e) && above(e)).length;
  const kpiAbove = Array.from(main.querySelectorAll<HTMLElement>('[data-slot="kpi-card"], [data-slot="kpi"]')).filter((e) => vis(e) && above(e)).length;

  // (e) ilk ekranda boş durumun kapladığı yükseklik payı
  const emptyAboveH = (empties as Array<{ h: number }>).reduce((a, _e, i) => {
    const el = Array.from(main.querySelectorAll<HTMLElement>('div')).filter((d) => vis(d) && /py-10|py-16/.test(d.className || ''))[i];
    if (!el) return a;
    const r = el.getBoundingClientRect();
    return a + Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top));
  }, 0);

  return { bySection, empties, clipped, liAbove, cellAbove, kpiAbove, emptyAboveH: Math.round(emptyAboveH), vh };
};

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: opts.vp, deviceScaleFactor: 2, isMobile: opts.vp.width < 700, hasTouch: opts.vp.width < 700, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, opts);
  const data = await page.evaluate(`(() => { const __name = (f) => f; return (${probe.toString()})(); })()`);
  process.stdout.write(JSON.stringify({ as: opts.as, vp: `${opts.vp.width}x${opts.vp.height}`, ...(data as object) }, null, 1) + '\n');
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
