/**
 * Tur 11 kokpit prob: açık bulguların yeniden ölçümü + yeni adaylar.
 *  - KPI şeridi bandı: toplam genişlik / içerik genişliği, flexGrow (kokpit-satis-kpi-band-width-10)
 *  - Odak dili: main içindeki odaklanabilir yüzeylerde focus-visible ring vs UA outline (kokpit-focus-ring-dialect-10)
 *  - Rozet anatomisi: aynı liste içinde dolgulu/dolgusuz sayımı (kokpit-wo-badge-anatomy-10)
 *  - Kanal satırı kademesi (kokpit-channel-single-tier-10 doğrulama)
 *  - StatStrip anatomisi: değer/etiket sırası, hücre yükseklikleri
 *  - Kolon dibi dengesi
 *   tsx scripts/probe-kokpit-r11.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r11');
const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const cw = main.getBoundingClientRect().width;

  // --- KPI şeridi
  const kpiCards = Array.from(main.querySelectorAll('[data-slot="kpi-card"],[data-kpi-card]')).filter(vis);
  let kpiStrip = null;
  if (kpiCards.length) {
    const parent = kpiCards[0].parentElement;
    const pb = parent.getBoundingClientRect();
    const rects = kpiCards.map((c) => c.getBoundingClientRect());
    kpiStrip = {
      count: kpiCards.length,
      parentW: r1(pb.width),
      cardWidths: rects.map((r) => r1(r.width)),
      sum: r1(rects.reduce((a, r) => a + r.width, 0)),
      lastRight: r1(Math.max(...rects.map((r) => r.right))),
      parentRight: r1(pb.right),
      flexGrow: kpiCards.map((c) => getComputedStyle(c).flexGrow),
      contentW: r1(cw),
    };
  }

  // --- Odak dili
  const focusables = Array.from(main.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"]),input,select,textarea')).filter(vis);
  const focusStyles = focusables.map((el) => {
    const cls = (typeof el.className === 'string' ? el.className : '');
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      hasFocusRing: /focus-visible:ring/.test(cls),
      hasOutlineNone: /outline-none|outline-hidden/.test(cls),
      w: r1(el.getBoundingClientRect().width),
      h: r1(el.getBoundingClientRect().height),
    };
  });
  const focusSummary = {
    total: focusStyles.length,
    withRing: focusStyles.filter((f) => f.hasFocusRing).length,
    withoutRing: focusStyles.filter((f) => !f.hasFocusRing).map((f) => ({ tag: f.tag, text: f.text, w: f.w, h: f.h })),
  };

  // --- Rozet anatomisi (StatusBadge)
  const badges = Array.from(main.querySelectorAll('[data-slot="status-badge"],[data-status-badge]')).filter(vis);
  const badgeInfo = badges.map((b) => {
    const cs = getComputedStyle(b);
    const sec = b.closest('section');
    return {
      section: sec ? (sec.querySelector('h2')?.textContent || '').trim() : '',
      text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
      bg: cs.backgroundColor,
      color: cs.color,
      h: r1(b.getBoundingClientRect().height),
      fs: cs.fontSize,
      filled: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent',
    };
  });
  const badgesBySection = {};
  badgeInfo.forEach((b) => {
    (badgesBySection[b.section] = badgesBySection[b.section] || []).push(b);
  });
  const badgeAnatomy = Object.entries(badgesBySection).map(([s, arr]) => ({
    section: s,
    n: arr.length,
    filled: arr.filter((b) => b.filled).length,
    unfilled: arr.filter((b) => !b.filled).map((b) => b.text),
    distinctBg: Array.from(new Set(arr.map((b) => b.bg))).length,
    heights: Array.from(new Set(arr.map((b) => b.h))),
    fontSizes: Array.from(new Set(arr.map((b) => b.fs))),
  }));

  // --- Section kolon dibi
  const sections = Array.from(main.querySelectorAll('section')).filter(vis);
  const cols = {};
  sections.forEach((s) => {
    const r = s.getBoundingClientRect();
    const k = String(Math.round(r.left));
    cols[k] = Math.max(cols[k] || 0, r.bottom + window.scrollY);
  });
  const colBottoms = Object.entries(cols).map(([left, bottom]) => ({ left: Number(left), bottom: r1(bottom) }));

  // --- Section satır kademeleri: her section içindeki 13px+ metin düğümlerinin fontSize/weight dağılımı
  const sectionRows = sections.map((s) => {
    const title = (s.querySelector('h2')?.textContent || '').trim();
    const rows = Array.from(s.querySelectorAll('a,div')).filter((el) => {
      if (!vis(el)) return false;
      const cs = getComputedStyle(el);
      return cs.display === 'flex' && cs.paddingLeft === '16px' && cs.paddingRight === '16px';
    });
    return {
      title,
      rowCount: rows.length,
      rowHeights: Array.from(new Set(rows.map((r) => r1(r.getBoundingClientRect().height)))),
      // para/sayı kolonu kademeleri
      numTiers: Array.from(new Set(rows.map((r) => {
        const nodes = Array.from(r.querySelectorAll('*')).filter((n) => n.children.length === 0 && /[0-9]/.test(n.textContent || ''));
        return nodes.map((n) => { const cs = getComputedStyle(n); return cs.fontSize + '/' + cs.fontWeight; }).join(',');
      }))),
    };
  });

  // --- StatStrip anatomisi: değer-üstte mi etiket-üstte mi
  const strips = Array.from(main.querySelectorAll('[data-slot="stat-strip"],[data-stat-strip]')).filter(vis);
  const stripInfo = strips.map((st) => {
    const sec = st.closest('section');
    const cells = Array.from(st.children).filter(vis);
    return {
      section: sec ? (sec.querySelector('h2')?.textContent || '').trim() : '',
      cells: cells.length,
      cellTexts: cells.map((c) => (c.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40)),
      cellHeights: Array.from(new Set(cells.map((c) => r1(c.getBoundingClientRect().height)))),
      lineOrder: cells.map((c) => Array.from(c.querySelectorAll('*')).filter((n) => n.children.length === 0 && (n.textContent||'').trim()).map((n) => { const cs = getComputedStyle(n); return cs.fontSize + '/' + cs.fontWeight; }).join(' > ')),
    };
  });

  // --- tabular-nums kapsaması
  const numLeafs = Array.from(main.querySelectorAll('*')).filter((el) => el.children.length === 0 && /[0-9]/.test(el.textContent || '') && vis(el));
  const nonTabular = numLeafs.filter((el) => !/tabular-nums/.test(getComputedStyle(el).fontVariantNumeric)).map((el) => (el.textContent || '').trim().slice(0, 50));

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    contentW: r1(cw),
    kpiStrip, focusSummary, badgeAnatomy, colBottoms, sectionRows, stripInfo,
    numLeafCount: numLeafs.length, nonTabular,
  };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    for (const as of ROLES) {
      for (const vp of [{ w: 1440, h: 900, m: false }, { w: 390, h: 844, m: true }]) {
        const ctx = await browser.newContext({
          viewport: { width: vp.w, height: vp.h },
          isMobile: vp.m, hasTouch: vp.m, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
        });
        const page = await ctx.newPage();
        await openRoute(page, { base, route: '/kokpit', as });
        out[`${as}-${vp.w}`] = await page.evaluate(SRC);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r11.json'), JSON.stringify(out, null, 2));
  console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
