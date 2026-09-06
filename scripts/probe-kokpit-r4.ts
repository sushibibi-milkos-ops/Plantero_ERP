/**
 * Tur 3 (builder) kokpit doğrulama probu — Tur 3 kritik bulgularının kapatıldığını kanıtlamak için.
 *   tsx scripts/probe-kokpit-r4.ts --as admin --viewport 1440x900
 * Ölçtükleri: bölüm başına kırpılan (truncate) metin sayısı, `.num` (MoneyCell/QtyCell) sağ kenar
 * spread'i, satır yüksekliği (li), belirli sütunların sol/sağ kenar spread'i (class işaretçisiyle).
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

  const sectionEls = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis);
  const sections = sectionEls.map((s) => {
    const title = txt(s.querySelector('h2,h3'));
    const rows = Array.from(s.querySelectorAll<HTMLElement>('li')).filter(vis);
    const hs = rows.map((x) => r1(x.getBoundingClientRect().height)).sort((a, b) => a - b);

    // Kırpılan (ellipsis) metinler bu bölümde
    const truncated: Array<{ text: string; clientW: number; scrollW: number }> = [];
    for (const el of Array.from(s.querySelectorAll<HTMLElement>('*'))) {
      if (!vis(el) || el.children.length > 0) continue;
      if (el.scrollWidth - el.clientWidth > 1 && getComputedStyle(el).textOverflow === 'ellipsis') {
        truncated.push({ text: txt(el).slice(0, 40), clientW: Math.round(el.clientWidth), scrollW: Math.round(el.scrollWidth) });
      }
    }

    // .num (MoneyCell/QtyCell) sağ kenar spread'i — SATIR BAŞINA SON `.num` (en sağdaki sayısal sütun,
    // ör. tutar); bir satırda hem miktar hem tutar varsa (ör. "En çok satan 5") ilkini değil SONuncusunu
    // alır, aksi halde iki farklı sütunun kenarları karışıp anlamsız bir "spread" üretir.
    const numRights = rows
      .map((row) => { const nums = Array.from(row.querySelectorAll<HTMLElement>('.num')).filter(vis); return nums[nums.length - 1] ?? null; })
      .filter((e): e is HTMLElement => e !== null)
      .map((e) => r1(e.getBoundingClientRect().right));
    const numSpread = numRights.length ? r1(Math.max(...numRights) - Math.min(...numRights)) : 0;

    // Sol kenar spread'i: `.flex-1.truncate` (ürün adı/partner gibi elastik metin sütunları)
    const leftEls = Array.from(s.querySelectorAll<HTMLElement>('.flex-1.truncate')).filter(vis);
    const lefts = leftEls.map((e) => r1(e.getBoundingClientRect().left));
    const leftSpread = lefts.length ? r1(Math.max(...lefts) - Math.min(...lefts)) : 0;
    // Sağ kenar spread'i: `sm:order-3` (konum etiketi gibi tutardan önceki sabit-olmayan sütunlar)
    const midEls = Array.from(s.querySelectorAll<HTMLElement>('.sm\\:order-3')).filter(vis);
    const midRights = midEls.map((e) => r1(e.getBoundingClientRect().right));
    const midSpread = midRights.length ? r1(Math.max(...midRights) - Math.min(...midRights)) : 0;

    return {
      title, rowCount: rows.length,
      rowH: hs.length ? [hs[0], hs[Math.floor((hs.length - 1) / 2)], hs[hs.length - 1]] : null,
      truncatedCount: truncated.length, truncated: truncated.slice(0, 6),
      numCount: numRights.length, numRights, numSpread,
      leftCount: lefts.length, lefts, leftSpread,
      midCount: midRights.length, midRights, midSpread,
    };
  });

  return { sections, vpW: innerWidth };
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
