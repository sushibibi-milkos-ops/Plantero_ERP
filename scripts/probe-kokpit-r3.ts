/**
 * Tur 3 kokpit ölçüm probu (docs/DESIGN-SCORECARD.md kural 6 eki):
 *   tsx scripts/probe-kokpit-r2.ts --as admin --viewport 1440x900
 * Ölçtükleri: pano kolon yükseklikleri, bölüm başına satır sayısı, satır içi/satır sonu ölü alan,
 * KPI şeridinin yatay taşması ve kırpılan KPI değerleri, StatStrip anatomileri,
 * eylemsiz EmptyState sayısı, satır yüksekliği varyansı, mobil metin çakışmaları.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

function parseArgs(argv: string[]) {
  let as = 'admin';
  let vp = { width: 1440, height: 900 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--as') as = argv[++i]!;
    else if (a === '--viewport') {
      const m = /^(\d+)x(\d+)$/.exec(argv[++i]!)!;
      vp = { width: Number(m[1]), height: Number(m[2]) };
    }
  }
  return { as, vp, base: defaultBaseUrl(), route: '/kokpit' };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const browser = await launchBrowser();
  const ctx = await browser.newContext({
    viewport: opts.vp,
    deviceScaleFactor: 2,
    isMobile: opts.vp.width < 700,
    hasTouch: opts.vp.width < 700,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  const page = await ctx.newPage();
  await openRoute(page, opts);

  const probe = () => {
    const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main') ?? document.body;

    // --- pano kolonları: main içindeki grid'in doğrudan çocukları
    const grids = Array.from(main.querySelectorAll<HTMLElement>('div')).filter((d) => {
      const cs = getComputedStyle(d);
      return cs.display === 'grid' && d.children.length >= 2 && d.getBoundingClientRect().width > 600;
    });
    const columns = grids.slice(0, 3).map((g) => ({
      cls: g.className.slice(0, 90),
      children: Array.from(g.children).map((c) => {
        const r = c.getBoundingClientRect();
        return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), label: txt(c.querySelector('h2,h3')) || txt(c).slice(0, 30) };
      }),
    }));

    // --- bölümler (section > header h2/h3)
    const sections = Array.from(main.querySelectorAll<HTMLElement>('section,[data-slot="section"]')).map((s) => {
      const r = s.getBoundingClientRect();
      const rows = s.querySelectorAll('li, [data-slot="row"]').length;
      const empty = !!s.querySelector('[data-slot="empty-state"], [data-empty]');
      const emptyHasAction = empty && !!s.querySelector('[data-slot="empty-state"] a, [data-slot="empty-state"] button');
      return { title: txt(s.querySelector('h2,h3')).slice(0, 40), top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), rows, empty, emptyHasAction };
    });

    // --- yatay taşan (scroll edilebilir) şeritler
    const scrollers = Array.from(main.querySelectorAll<HTMLElement>('*'))
      .filter((el) => el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 100)
      .slice(0, 10)
      .map((el) => ({ cls: el.className.toString().slice(0, 70), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: txt(el).slice(0, 60) }));

    // --- kırpılan metin (ellipsis olmadan kesilen ya da kutudan taşan) elemanlar
    const clipped: Array<{ text: string; sw: number; cw: number; visible: number }> = [];
    const vpW = document.documentElement.clientWidth;
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('span,div,p'))) {
      if (el.children.length > 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const visible = Math.max(0, Math.min(r.right, vpW) - Math.max(r.left, 0));
      if (visible + 1 < r.width) clipped.push({ text: txt(el).slice(0, 40), sw: Math.round(r.width), cw: Math.round(visible), visible: Math.round(visible) });
    }

    // --- satır içi en büyük yatay boşluk + satır sonu ölü alan (flex satırlar)
    const gaps: Array<{ section: string; gap: number; trailing: number; rowW: number }> = [];
    for (const s of Array.from(main.querySelectorAll<HTMLElement>('section'))) {
      const title = txt(s.querySelector('h2,h3')).slice(0, 30);
      const li = s.querySelector<HTMLElement>('li');
      if (!li) continue;
      const rr = li.getBoundingClientRect();
      const kids = Array.from(li.querySelectorAll<HTMLElement>('*')).filter((k) => k.children.length === 0 && k.getBoundingClientRect().width > 0 && txt(k));
      if (!kids.length) continue;
      const boxes = kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      let maxGap = 0;
      for (let i = 1; i < boxes.length; i++) maxGap = Math.max(maxGap, boxes[i]!.left - boxes[i - 1]!.right);
      const trailing = rr.right - Math.max(...boxes.map((b) => b.right));
      gaps.push({ section: title, gap: Math.round(maxGap), trailing: Math.round(trailing), rowW: Math.round(rr.width) });
    }

    // --- StatStrip anatomileri: hücrelerde etiket değerin üstünde mi altında mı
    const strips = Array.from(main.querySelectorAll<HTMLElement>('[class*="divide-x"]')).map((st) => {
      const cell = st.children[0] as HTMLElement | undefined;
      const kids = cell ? Array.from(cell.querySelectorAll<HTMLElement>('*')).filter((k) => k.children.length === 0 && txt(k)) : [];
      const sizes = kids.map((k) => ({ t: txt(k).slice(0, 18), fs: getComputedStyle(k).fontSize, top: Math.round(k.getBoundingClientRect().top) }));
      const section = st.closest('section');
      return { section: txt(section?.querySelector('h2,h3') ?? null).slice(0, 28), cells: st.children.length, cellH: cell ? Math.round(cell.getBoundingClientRect().height) : 0, order: sizes };
    });

    // --- li yükseklik dağılımı bölüm bazında
    const rowStats = Array.from(main.querySelectorAll<HTMLElement>('section')).map((s) => {
      const hs = Array.from(s.querySelectorAll<HTMLElement>('li')).map((l) => Math.round(l.getBoundingClientRect().height));
      return { title: txt(s.querySelector('h2,h3')).slice(0, 30), n: hs.length, min: Math.min(...hs), max: Math.max(...hs) };
    }).filter((r) => r.n > 0);

    // --- bitişik metin çakışması (0px boşluk)
    const collisions: Array<{ a: string; b: string; gap: number }> = [];
    for (const s of Array.from(main.querySelectorAll<HTMLElement>('li'))) {
      const kids = Array.from(s.querySelectorAll<HTMLElement>('*')).filter((k) => k.children.length === 0 && txt(k) && k.getBoundingClientRect().width > 0);
      const boxes = kids.map((k) => ({ el: k, r: k.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left);
      for (let i = 1; i < boxes.length; i++) {
        const prev = boxes[i - 1]!;
        const cur = boxes[i]!;
        if (Math.abs(prev.r.top - cur.r.top) > 6) continue;
        const g = cur.r.left - prev.r.right;
        if (g < 4) collisions.push({ a: txt(prev.el).slice(0, 26), b: txt(cur.el).slice(0, 26), gap: Math.round(g) });
      }
    }

    const contentBottom = Math.round(Math.max(...Array.from(main.children).map((c) => c.getBoundingClientRect().bottom)));
    return { columns, sections, scrollers, clipped: clipped.slice(0, 12), gaps, strips, rowStats, collisions: collisions.slice(0, 12), contentBottom };
  };
  const out = (await page.evaluate(`(() => { const __name=(f)=>f; return (${probe.toString()})(); })()`)) as any;

  console.log(JSON.stringify({ as: opts.as, viewport: `${opts.vp.width}x${opts.vp.height}`, ...out }, null, 1));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
