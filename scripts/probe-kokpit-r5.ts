/**
 * Tur 5 (kritik) kokpit ölçüm probu — docs/DESIGN-SCORECARD.md kural 6 eki.
 *   tsx scripts/probe-kokpit-r5.ts --as admin --viewport 1440x900
 * Ölçtükleri: `active:` basılı-durum kapsaması, QtyCell sıfır tonu, StatStrip hücre
 * anatomisi (etiket-üstte mi değer-üstte mi), boş durum yükseklikleri, kolon dengesi,
 * mobil kart yükseklikleri, satır yükseklikleri.
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

  // 1) active: kapsaması — main içindeki etkileşimli yüzeyler
  const inter = Array.from(main.querySelectorAll<HTMLElement>('a[href],button,[role="button"]')).filter(vis);
  const withActive = inter.filter((el) => /(^|\s|:)active:/.test(el.className || '') || /\[&:active/.test(el.className || ''));
  // global stil kuralı da say
  let globalActiveRule = false;
  try {
    for (const sh of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try { rules = (sh as CSSStyleSheet).cssRules; } catch { continue; }
      if (!rules) continue;
      for (const r of Array.from(rules)) {
        const t = (r as CSSStyleRule).selectorText;
        if (t && /:active/.test(t) && /button|a\b|\[role/.test(t)) { globalActiveRule = true; }
      }
    }
  } catch { /* noop */ }

  // 2) miktar/para sıfır tonu
  const leaves = Array.from(main.querySelectorAll<HTMLElement>('*')).filter((el) => vis(el) && el.children.length === 0 && txt(el).length > 0);
  const numLeaves = leaves.filter((el) => /^(-)?(₺|€|\$)?\s?[\d.]+(,\d+)?$/.test(txt(el)));
  const zeroTones = numLeaves.filter((el) => /^(-)?(₺|€|\$)?\s?0([.,]0+)?$/.test(txt(el))).map((el) => ({ text: txt(el), color: getComputedStyle(el).color, cls: (el.className||'').slice(0,60) }));
  const nonZeroColors = Array.from(new Set(numLeaves.filter((el) => !/^(-)?(₺|€|\$)?\s?0([.,]0+)?$/.test(txt(el))).map((el) => getComputedStyle(el).color)));
  // QtyCell özel
  const qty = Array.from(main.querySelectorAll<HTMLElement>('span.num')).filter(vis).map((el) => ({ text: txt(el), color: getComputedStyle(el).color }));

  // 3) StatStrip hücre anatomisi: hücre içindeki ilk metin çocuğun font-size'ı > ikincisi mi?
  const strips = Array.from(main.querySelectorAll<HTMLElement>('[data-slot="stat-strip"], .divide-x')).filter(vis).map((s) => {
    const cells = Array.from(s.children).filter((c) => vis(c)) as HTMLElement[];
    const anatomy = cells.slice(0, 4).map((c) => {
      const kids = Array.from(c.querySelectorAll<HTMLElement>('*')).filter((k) => vis(k) && k.children.length === 0 && txt(k).length > 0);
      return kids.slice(0, 3).map((k) => `${r1(parseFloat(getComputedStyle(k).fontSize))}px:${txt(k).slice(0, 18)}`).join(' | ');
    });
    return { section: txt(s.closest('section')?.querySelector('h2,h3') ?? null), h: Math.round(s.getBoundingClientRect().height), anatomy };
  });

  // 4) boş durumlar
  const empties = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis).map((s) => {
    const e = Array.from(s.querySelectorAll<HTMLElement>('div')).find((d) => vis(d) && /py-10|py-16/.test(d.className || ''));
    return e ? { section: txt(s.querySelector('h2,h3')), h: Math.round(e.getBoundingClientRect().height), sectionH: Math.round(s.getBoundingClientRect().height) } : null;
  }).filter(Boolean);

  // 5) satır yükseklikleri (a[href] satır bağlantıları)
  const rowLinks = Array.from(main.querySelectorAll<HTMLElement>('li > a[href]')).filter(vis).map((a) => ({ h: r1(a.getBoundingClientRect().height), section: txt(a.closest('section')?.querySelector('h2,h3') ?? null) }));
  const bySec: Record<string, number[]> = {};
  for (const r of rowLinks) { (bySec[r.section] ||= []).push(r.h); }

  return {
    interactive: inter.length, withActive: withActive.length, globalActiveRule,
    zeroTones, nonZeroColors, qty,
    strips, empties, rowHeights: bySec,
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
