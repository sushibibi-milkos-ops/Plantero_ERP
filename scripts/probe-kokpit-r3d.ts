/**
 * Tur 3 (kritik) kokpit ölçüm probu — docs/DESIGN-SCORECARD.md kural 6 eki.
 *   tsx scripts/probe-kokpit-r3d.ts --as admin --viewport 1440x900
 * Ölçtükleri: bölüm başına satır yüksekliği, kolon yükseklik dengesi, kırpılan (truncate) metinler,
 * StatusBadge arka planları, para ondalık tutarlılığı, tabular-nums, katlama üstü satır sayısı,
 * 14px yetim kademe, boş durum kart yüksekliği, sütun hizası.
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

  // --- bölümler: başlığı olan kart benzeri bloklar
  const sectionEls = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis);
  const sections = sectionEls.map((s) => {
    const r = s.getBoundingClientRect();
    const title = txt(s.querySelector('h2,h3'));
    const rows = Array.from(s.querySelectorAll<HTMLElement>('li')).filter(vis);
    const hs = rows.map((x) => r1(x.getBoundingClientRect().height)).sort((a, b) => a - b);
    const empty = s.querySelector('[data-slot="empty-state"],[data-empty]');
    return {
      title, top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width),
      rowCount: rows.length,
      rowH: hs.length ? [hs[0], hs[Math.floor((hs.length - 1) / 2)], hs[hs.length - 1]] : null,
      empty: !!empty, emptyH: empty ? Math.round((empty as HTMLElement).getBoundingClientRect().height) : 0,
      emptyAction: empty ? !!empty.querySelector('a,button') : false,
    };
  });

  // --- pano kolonları
  const grids = Array.from(main.querySelectorAll<HTMLElement>('div')).filter((d) => {
    const cs = getComputedStyle(d); return cs.display === 'grid' && d.children.length >= 2 && d.getBoundingClientRect().width > 600;
  });
  const columns = grids.slice(0, 2).map((g) => {
    const cs = getComputedStyle(g);
    const kids = Array.from(g.children).map((c) => { const r = c.getBoundingClientRect(); return { h: Math.round(r.height), left: Math.round(r.left), bottom: Math.round(r.bottom + scrollY), label: txt(c.querySelector('h2,h3')) || txt(c).slice(0, 24) }; });
    // kolon = aynı left'e sahip çocuklar
    const byLeft = new Map<number, number>();
    for (const k of kids) byLeft.set(k.left, Math.max(byLeft.get(k.left) ?? 0, k.bottom));
    return { cols: cs.gridTemplateColumns, tops: Array.from(byLeft.entries()).map(([left, bottom]) => ({ left, bottom })), kids };
  });

  // --- kırpılan metinler (truncate)
  const truncated: Array<{ text: string; clientW: number; scrollW: number; section: string }> = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    if (!vis(el)) continue;
    if (el.children.length > 0) continue;
    if (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).textOverflow === 'ellipsis') {
      const sec = el.closest('section');
      truncated.push({ text: txt(el).slice(0, 40), clientW: Math.round(el.clientWidth), scrollW: Math.round(el.scrollWidth), section: txt(sec?.querySelector('h2,h3') ?? null) });
    }
  }

  // --- durum rozetleri
  const badges = Array.from(main.querySelectorAll<HTMLElement>('[data-slot="status-badge"], [data-slot="badge"], span[class*="badge"]')).filter(vis).map((b) => {
    const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
    return { text: txt(b), bg: cs.backgroundColor, color: cs.color, h: r1(r.height), fs: cs.fontSize, border: cs.borderTopWidth + ' ' + cs.borderTopColor };
  });

  // --- para gösterimi
  const moneyRe = /(₺|€|\$)\s?-?[\d.]+(,\d+)?/;
  const money: Array<{ text: string; dec: boolean; fs: string; fvn: string; align: string }> = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    if (!vis(el) || el.children.length > 0) continue;
    const t = txt(el);
    if (!moneyRe.test(t) || t.length > 24) continue;
    const cs = getComputedStyle(el);
    money.push({ text: t, dec: /,\d{2}$/.test(t), fs: cs.fontSize, fvn: cs.fontVariantNumeric, align: cs.textAlign });
  }

  // --- 14px yetim kademe
  const px14: string[] = [];
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    if (!vis(el)) continue;
    let has = false; for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.textContent ?? '').trim()) { has = true; break; }
    if (!has) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (Math.abs(fs - 14) < 0.6) px14.push(txt(el).slice(0, 30));
  }

  // --- katlama üstü satır sayısı (viewport yüksekliği)
  const foldRows = Array.from(main.querySelectorAll<HTMLElement>('li')).filter((el) => vis(el) && el.getBoundingClientRect().top < innerHeight).length;

  return { sections, columns, truncated, badges, money, px14, foldRows, pageH: Math.round(document.documentElement.scrollHeight), vpH: innerHeight };
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
