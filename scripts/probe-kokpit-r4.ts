/**
 * Tur 4 (kritik) kokpit ölçüm probu — docs/DESIGN-SCORECARD.md kural 6 eki.
 *   tsx scripts/probe-kokpit-r4.ts --as admin --viewport 1440x900
 * Ölçtükleri: bölüm başına para ondalık tutarlılığı, sayı sütunu sağ kenar hizası,
 * sıfır değerlerin tonu, kolon yükseklik dengesi, KPI şerit hücre genişlikleri,
 * boş durum yüksekliği, katlama üstü satır sayısı, kırpılan metinler.
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
  const leaves = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>('*')).filter((el) => vis(el) && el.children.length === 0 && txt(el).length > 0);

  const moneyRe = /^(-)?(₺|€|\$)\s?[\d.]+(,\d+)?$/;
  const numRe = /^(-)?(₺|€|\$)?\s?[\d.]+(,\d+)?(\s?%)?$/;

  const sectionEls = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis);
  const sections = sectionEls.map((s) => {
    const r = s.getBoundingClientRect();
    const title = txt(s.querySelector('h2,h3'));
    const rows = Array.from(s.querySelectorAll<HTMLElement>('li')).filter(vis);
    const hs = rows.map((x) => r1(x.getBoundingClientRect().height)).sort((a, b) => a - b);
    const empty = s.querySelector('[data-slot="empty-state"],[data-empty]');
    // para: bölüm içindeki tüm para metinleri + ondalık var mı + sağ kenar
    const monies = leaves(s).filter((el) => moneyRe.test(txt(el))).map((el) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { text: txt(el), dec: /,\d{2}$/.test(txt(el)), right: r1(rect.right), fs: cs.fontSize, fvn: cs.fontVariantNumeric, color: cs.color };
    });
    const decs = new Set(monies.map((m) => m.dec));
    // liste satırlarındaki sayı sütunu sağ kenarı (satır başına en sağdaki sayısal yaprak)
    const rowRights: number[] = [];
    for (const row of rows) {
      const nums = leaves(row).filter((el) => numRe.test(txt(el)));
      if (!nums.length) continue;
      rowRights.push(r1(Math.max(...nums.map((n) => n.getBoundingClientRect().right))));
    }
    // sıfır değerler ve tonları
    const zeros = leaves(s).filter((el) => /^(-)?(₺|€|\$)?\s?0([.,]0+)?(\s?%)?$/.test(txt(el))).map((el) => ({ text: txt(el), color: getComputedStyle(el).color }));
    return {
      title, top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), h: Math.round(r.height), w: Math.round(r.width), left: Math.round(r.left),
      rowCount: rows.length,
      rowH: hs.length ? [hs[0], hs[Math.floor((hs.length - 1) / 2)], hs[hs.length - 1]] : null,
      mixedDecimals: decs.size > 1,
      monies: monies.map((m) => `${m.text}${m.dec ? '' : ' [0dec]'}@${m.right}`),
      rowRightSpread: rowRights.length ? r1(Math.max(...rowRights) - Math.min(...rowRights)) : 0,
      rowRights,
      zeros,
      empty: !!empty, emptyH: empty ? Math.round((empty as HTMLElement).getBoundingClientRect().height) : 0,
    };
  });

  // kolon dengesi: aynı left'e sahip section'ların en alt kenarı
  const byLeft = new Map<number, { bottom: number; last: string }>();
  for (const s of sections) {
    const cur = byLeft.get(s.left);
    if (!cur || s.bottom > cur.bottom) byLeft.set(s.left, { bottom: s.bottom, last: s.title });
  }
  const columns = Array.from(byLeft.entries()).map(([left, v]) => ({ left, bottom: v.bottom, last: v.last }));
  const colSpread = columns.length > 1 ? Math.max(...columns.map((c) => c.bottom)) - Math.min(...columns.map((c) => c.bottom)) : 0;

  // KPI şeridi (ilk grid, section olmayan)
  const kpiWrap = main.querySelector<HTMLElement>('[data-slot="kpi-strip"]') ?? main.querySelector<HTMLElement>('div[class*="grid"]');
  const kpi = kpiWrap ? Array.from(kpiWrap.children).map((c) => { const r = c.getBoundingClientRect(); return { label: txt(c).slice(0, 28), w: Math.round(r.width), left: Math.round(r.left) }; }) : [];

  // kırpılan metinler
  const truncated: Array<{ text: string; clientW: number; scrollW: number; section: string }> = [];
  for (const el of leaves(main)) {
    if (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).textOverflow === 'ellipsis') {
      truncated.push({ text: txt(el).slice(0, 40), clientW: Math.round(el.clientWidth), scrollW: Math.round(el.scrollWidth), section: txt(el.closest('section')?.querySelector('h2,h3') ?? null) });
    }
  }

  const foldRows = Array.from(main.querySelectorAll<HTMLElement>('li')).filter((el) => vis(el) && el.getBoundingClientRect().bottom <= innerHeight).length;

  // tüm sıfırların tonu (sayfa geneli)
  const allZeros = leaves(main).filter((el) => /^(-)?(₺|€|\$)?\s?0([.,]0+)?(\s?%)?$/.test(txt(el))).map((el) => ({ text: txt(el), color: getComputedStyle(el).color, section: txt(el.closest('section')?.querySelector('h2,h3') ?? null) }));

  return { sections, columns, colSpread, kpi, truncated, foldRows, allZeros, pageH: Math.round(document.documentElement.scrollHeight), vpH: innerHeight };
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
