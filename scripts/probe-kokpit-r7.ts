/**
 * Tur 7 (kritik) kokpit ölçüm probu — docs/DESIGN-SCORECARD.md kural 6 eki.
 *   tsx scripts/probe-kokpit-r7.ts --as admin --viewport 1440x900
 * Tur 6 probunun üstüne: (f) kolon dibi dengesi, (g) tabular-nums kapsaması,
 * (h) sayı sütunu sağ kenar hizası, (i) tek satırlık satır yüksekliği distinct kümesi,
 * (j) `active:`/`hover:` kapsaması, (k) 40px altı `li` envanteri, (l) bölüm arası boşluklar.
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
  const vh = window.innerHeight;
  const above = (el: Element) => el.getBoundingClientRect().top < vh;

  // (a) liste satırı yükseklikleri: bölüm + alt satır sayısı
  const rows: Array<{ section: string; h: number; lines: number; tag: string; text: string }> = [];
  for (const li of Array.from(main.querySelectorAll<HTMLElement>('li')).filter(vis)) {
    const inner = (li.firstElementChild as HTMLElement) ?? li;
    const sec = txt(li.closest('section')?.querySelector('h2,h3') ?? null);
    const h = r1(inner.getBoundingClientRect().height);
    const tops = new Set(Array.from(li.querySelectorAll<HTMLElement>('*'))
      .filter((e) => vis(e) && e.children.length === 0 && txt(e).length > 0)
      .map((e) => Math.round(e.getBoundingClientRect().top)));
    rows.push({ section: sec, h, lines: tops.size, tag: inner.tagName.toLowerCase(), text: txt(li).slice(0, 40) });
  }
  const bySection: Record<string, { h: number[]; lines: number[] }> = {};
  for (const r of rows) { (bySection[r.section] ||= { h: [], lines: [] }); bySection[r.section]!.h.push(r.h); bySection[r.section]!.lines.push(r.lines); }
  const singleLine = [...new Set(rows.filter((r) => r.lines <= 1).map((r) => r.h))].sort((a, b) => a - b);
  const multiLine = [...new Set(rows.filter((r) => r.lines >= 2).map((r) => r.h))].sort((a, b) => a - b);
  const smallRows = rows.filter((r) => r.h < 36).map((r) => ({ section: r.section, h: r.h, lines: r.lines, text: r.text }));

  // (b) boş durum anatomisi
  const emptyEls = Array.from(main.querySelectorAll<HTMLElement>('div')).filter((d) => vis(d) && /py-10|py-16|py-8/.test(d.className || ''));
  const empties = emptyEls.map((e) => {
    const s = e.closest('section');
    const leaves = Array.from(e.querySelectorAll<HTMLElement>('*')).filter((k) => vis(k) && k.children.length === 0 && txt(k).length > 0);
    return {
      section: txt(s?.querySelector('h2,h3') ?? null), h: Math.round(e.getBoundingClientRect().height),
      sectionH: s ? Math.round(s.getBoundingClientRect().height) : 0,
      icon: !!e.querySelector('svg'), textLines: leaves.length,
      texts: leaves.map((k) => txt(k).slice(0, 40)),
      action: !!e.querySelector('a[href],button'),
    };
  });

  // (c) kırpılan metinler
  const clipped = Array.from(main.querySelectorAll<HTMLElement>('*')).filter(vis)
    .filter((el) => el.children.length === 0 && txt(el).length > 0 && el.scrollWidth - el.clientWidth > 1)
    .map((el) => ({ text: txt(el).slice(0, 44), clientW: el.clientWidth, scrollW: el.scrollWidth }));

  // (d) katlama üstü bilgi birimi
  const liAbove = Array.from(main.querySelectorAll<HTMLElement>('li')).filter((e) => vis(e) && above(e)).length;
  const cellAbove = Array.from(main.querySelectorAll<HTMLElement>('.divide-x > *')).filter((e) => vis(e) && above(e)).length;

  // (f) kolon dibi dengesi: en alttaki section'ların sol/sağ kolon dipleri
  const secs = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis)
    .map((s) => ({ title: txt(s.querySelector('h2,h3')), top: Math.round(s.getBoundingClientRect().top), bottom: Math.round(s.getBoundingClientRect().bottom), left: Math.round(s.getBoundingClientRect().left), w: Math.round(s.getBoundingClientRect().width) }));
  const lefts = [...new Set(secs.map((s) => s.left))].sort((a, b) => a - b);
  const colBottoms = lefts.map((l) => ({ left: l, bottom: Math.max(...secs.filter((s) => s.left === l).map((s) => s.bottom)) }));
  const colSpread = colBottoms.length > 1 ? Math.max(...colBottoms.map((c) => c.bottom)) - Math.min(...colBottoms.map((c) => c.bottom)) : 0;

  // (g) tabular-nums kapsaması: rakam taşıyan yaprak metinler
  const numLeaves = Array.from(main.querySelectorAll<HTMLElement>('*')).filter(vis)
    .filter((el) => el.children.length === 0 && /[0-9]/.test(txt(el)) && txt(el).length <= 30);
  const noTab = numLeaves.filter((el) => !/tabular-nums/.test(getComputedStyle(el).fontVariantNumeric))
    .map((el) => ({ text: txt(el).slice(0, 30), fvn: getComputedStyle(el).fontVariantNumeric }));

  // (h) sayı sütunu sağ kenar hizası (bölüm bazında li içindeki son çocuk sağ kenarı)
  const rightsBySection: Record<string, number[]> = {};
  for (const li of Array.from(main.querySelectorAll<HTMLElement>('li')).filter(vis)) {
    const sec = txt(li.closest('section')?.querySelector('h2,h3') ?? null);
    const last = li.querySelector<HTMLElement>(':scope > * > *:last-child');
    if (!last || !vis(last)) continue;
    (rightsBySection[sec] ||= []).push(Math.round(last.getBoundingClientRect().right));
  }
  const rightSpread = Object.fromEntries(Object.entries(rightsBySection).map(([k, v]) => [k, Math.max(...v) - Math.min(...v)]));

  // (j) etkileşim geri bildirimi: main içindeki tıklanabilirlerde active/hover sınıfı
  const interactive = Array.from(main.querySelectorAll<HTMLElement>('a[href],button')).filter(vis);
  const noActive = interactive.filter((el) => !/active:/.test(el.className || '')).map((el) => ({ text: txt(el).slice(0, 30), cls: (el.className || '').slice(0, 70) }));
  const noHover = interactive.filter((el) => !/hover:/.test(el.className || '')).map((el) => txt(el).slice(0, 30));
  const noFocus = interactive.filter((el) => !/focus-visible:/.test(el.className || '')).map((el) => txt(el).slice(0, 30));

  // (l) bölüm arası dikey boşluklar (8pt ritmi)
  const gaps: number[] = [];
  const sorted = [...secs].sort((a, b) => a.top - b.top);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.left !== sorted[i - 1]!.left) continue;
    gaps.push(sorted[i]!.top - sorted[i - 1]!.bottom);
  }

  // (m) 44px altı dokunma hedefleri (yalnızca main içi)
  const smallTargets = interactive.map((el) => ({ t: txt(el).slice(0, 24), w: r1(el.getBoundingClientRect().width), h: r1(el.getBoundingClientRect().height) }))
    .filter((e) => e.h < 44 || e.w < 44);

  return {
    bySection, singleLine, multiLine, smallRows, empties, clipped, liAbove, cellAbove,
    colBottoms, colSpread, noTabCount: noTab.length, noTab: noTab.slice(0, 12), numLeafCount: numLeaves.length,
    rightSpread, interactiveCount: interactive.length, noActive, noHover, noFocus,
    gaps: [...new Set(gaps)].sort((a, b) => a - b), smallTargets: smallTargets.slice(0, 15), vh,
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
  };
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
