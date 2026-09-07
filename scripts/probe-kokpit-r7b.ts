/**
 * Tur 7 (kritik) ek prob: `li` KUTUSUNUN kendi yüksekliği (Tur 7 r7 probunda `firstElementChild`
 * bazı listelerde satır sarmalayıcısı değil, iç bir `span` olduğu için 16/19.5px ölçülüyordu),
 * satır içeriğinin ayırt ediciliği (aynı metne sahip satır sayısı) ve kolon dibi dengesi
 * (tam genişlikteki `lg:col-span-2` bölümler HARİÇ).
 *   tsx scripts/probe-kokpit-r7b.ts --as admin --viewport 1440x900
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

  const rows = Array.from(main.querySelectorAll<HTMLElement>('li')).filter(vis).map((li) => {
    const sec = txt(li.closest('section')?.querySelector('h2,h3') ?? null);
    const tops = new Set(Array.from(li.querySelectorAll<HTMLElement>('*'))
      .filter((e) => vis(e) && e.children.length === 0 && txt(e).length > 0)
      .map((e) => Math.round(e.getBoundingClientRect().top)));
    return { section: sec, h: r1(li.getBoundingClientRect().height), lines: tops.size, text: txt(li) };
  });
  const bySection: Record<string, { heights: number[]; lines: number[]; n: number }> = {};
  for (const r of rows) { const b = (bySection[r.section] ||= { heights: [], lines: [], n: 0 }); if (!b.heights.includes(r.h)) b.heights.push(r.h); if (!b.lines.includes(r.lines)) b.lines.push(r.lines); b.n++; }

  // Ayırt edicilik: aynı bölümde BİREBİR aynı metne sahip satırlar
  const dupes: Array<{ section: string; text: string; n: number }> = [];
  const seen: Record<string, number> = {};
  for (const r of rows) { const k = `${r.section}||${r.text}`; seen[k] = (seen[k] ?? 0) + 1; }
  for (const [k, n] of Object.entries(seen)) if (n > 1) { const [section, text] = k.split('||'); dupes.push({ section: section!, text: text!.slice(0, 60), n }); }

  // Kolon dibi dengesi — tam genişlikteki bölümler hariç
  const secs = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis).map((s) => {
    const r = s.getBoundingClientRect();
    return { title: txt(s.querySelector('h2,h3')), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), top: Math.round(r.top), w: Math.round(r.width) };
  });
  const maxW = Math.max(...secs.map((s) => s.w));
  const cols = secs.filter((s) => s.w < maxW * 0.75);
  const lefts = [...new Set(cols.map((s) => s.left))].sort((a, b) => a - b);
  const colBottoms = lefts.map((l) => ({ left: l, bottom: Math.max(...cols.filter((s) => s.left === l).map((s) => s.bottom)) }));
  const colSpread = colBottoms.length > 1 ? Math.max(...colBottoms.map((c) => c.bottom)) - Math.min(...colBottoms.map((c) => c.bottom)) : 0;

  // Satır sağ kenar hizası: son GÖRÜNÜR yaprak metnin sağ kenarı
  const rightsBySection: Record<string, number[]> = {};
  for (const li of Array.from(main.querySelectorAll<HTMLElement>('li')).filter(vis)) {
    const sec = txt(li.closest('section')?.querySelector('h2,h3') ?? null);
    const leaves = Array.from(li.querySelectorAll<HTMLElement>('*')).filter((e) => vis(e) && e.children.length === 0 && txt(e).length > 0);
    if (!leaves.length) continue;
    const maxRight = Math.max(...leaves.map((e) => Math.round(e.getBoundingClientRect().right)));
    (rightsBySection[sec] ||= []).push(maxRight);
  }
  const rightSpread = Object.fromEntries(Object.entries(rightsBySection).map(([k, v]) => [k, Math.max(...v) - Math.min(...v)]));

  return { bySection, dupes, colBottoms, colSpread, rightSpread, secs: secs.map((s) => ({ t: s.title, top: s.top, bottom: s.bottom, left: s.left, w: s.w })) };
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
