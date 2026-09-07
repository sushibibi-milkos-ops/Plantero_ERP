/**
 * Tur 10 kokpit prob-A: gerçek sayfa anatomisi (5 rol × 2 viewport).
 * Ölçtükleri:
 *  - Section başlık yüksekliği, satır (RowLink/Row) yükseklikleri, bayt-bayt aynı satır çifti
 *  - Kolon dibi dengesi (FlowGrid/DashboardGrid en alt sınır farkı)
 *  - Sayısal metin taşıyan TÜM düğümlerde tabular-nums kapsaması (para + meta)
 *  - Sıfır değerlerin soluklaştırılması
 *  - Rozet anatomisi (dolgulu / dolgusuz) — aynı listede kaç farklı anatomi
 *  - Boş durum anatomisi (ikon + başlık + açıklama + eylem)
 *  - Sağ kenar hizası (para kolonu), scrollWidth/clientWidth
 *   tsx scripts/probe-kokpit-r10.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r10');
const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };

  // --- Section anatomisi
  const sections = Array.from(main.querySelectorAll('section')).filter(vis);
  const sectionInfo = sections.map((s) => {
    const h = s.querySelector('header');
    const title = h ? (h.querySelector('h2')?.textContent || '').trim() : '';
    const hb = h ? h.getBoundingClientRect() : null;
    const cs = getComputedStyle(s);
    return {
      title,
      headerH: hb ? r1(hb.height) : null,
      radius: cs.borderTopLeftRadius,
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      bottom: r1(s.getBoundingClientRect().bottom + window.scrollY),
      left: r1(s.getBoundingClientRect().left),
    };
  });

  // --- Satırlar: RowLink (a) + Row (div) ROW_BASE imzası px-4 py-2.5 text-[13px]
  const rowNodes = Array.from(main.querySelectorAll('a,div')).filter((el) => {
    if (!vis(el)) return false;
    const cs = getComputedStyle(el);
    if (cs.display !== 'flex') return false;
    if (cs.paddingLeft !== '16px' || cs.paddingRight !== '16px') return false;
    if (cs.fontSize !== '13px') return false;
    const p = el.parentElement;
    if (!p || !p.className || typeof p.className !== 'string') return true;
    return true;
  });
  const rowHeights = rowNodes.map((el) => r1(el.getBoundingClientRect().height));
  const rowTexts = rowNodes.map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim());
  const dupe = {};
  rowTexts.forEach((t) => { if (t) dupe[t] = (dupe[t] || 0) + 1; });
  const dupeRows = Object.entries(dupe).filter(([, n]) => n > 1).map(([t, n]) => ({ t: t.slice(0, 90), n }));

  // --- tabular-nums kapsaması: rakam içeren yaprak metin düğümleri
  const leafs = Array.from(main.querySelectorAll('*')).filter((el) => {
    if (!vis(el)) return false;
    if (el.children.length > 0) return false;
    const t = (el.textContent || '').trim();
    return /[0-9]/.test(t);
  });
  const nonTab = [];
  leafs.forEach((el) => {
    const cs = getComputedStyle(el);
    const fv = cs.fontVariantNumeric || '';
    const ff = cs.fontFeatureSettings || '';
    const mono = /mono/i.test(cs.fontFamily);
    if (!/tabular-nums/.test(fv) && !/tnum/.test(ff) && !mono) {
      nonTab.push({ t: (el.textContent || '').trim().slice(0, 40), fs: cs.fontSize, cls: (el.getAttribute('class') || '').slice(0, 60) });
    }
  });

  // --- rozet anatomisi
  const badges = Array.from(main.querySelectorAll('[data-status]')).filter(vis).map((b) => {
    const cs = getComputedStyle(b);
    return { t: (b.textContent || '').trim(), bg: cs.backgroundColor, color: cs.color, h: r1(b.getBoundingClientRect().height), fs: cs.fontSize };
  });
  const badgeFilled = badges.filter((b) => b.bg !== 'rgba(0, 0, 0, 0)' && b.bg !== 'transparent').length;

  // --- boş durum
  const empties = Array.from(main.querySelectorAll('section')).filter(vis).map((s) => {
    const txt = (s.textContent || '');
    if (!/yok|bulunam|henüz/i.test(txt)) return null;
    return {
      title: (s.querySelector('h2')?.textContent || '').trim(),
      svg: s.querySelectorAll('svg').length,
      buttons: s.querySelectorAll('a[href],button').length,
      h: r1(s.getBoundingClientRect().height),
    };
  }).filter(Boolean);

  // --- sağ kenar hizası: her section içindeki en sağdaki metin düğümlerinin right değerleri
  const rightEdges = sections.map((s) => {
    const rects = Array.from(s.querySelectorAll('span,div')).filter(vis)
      .map((el) => r1(el.getBoundingClientRect().right));
    const sr = r1(s.getBoundingClientRect().right);
    const near = rects.filter((r) => sr - r < 25 && sr - r >= 0);
    const uniq = Array.from(new Set(near.map((n) => r1(sr - n))));
    return { title: (s.querySelector('h2')?.textContent || '').trim(), pads: uniq.sort((a,b)=>a-b).slice(0, 6) };
  });

  // --- kolon dibi dengesi
  const grid = main.querySelector('[class*="columns-2"], [class*="lg:grid-cols-2"], .grid');
  let colBalance = null;
  if (sections.length > 1) {
    const lefts = {};
    sections.forEach((s) => { const l = Math.round(s.getBoundingClientRect().left); (lefts[l] = lefts[l] || []).push(r1(s.getBoundingClientRect().bottom + window.scrollY)); });
    const cols = Object.entries(lefts).map(([l, arr]) => ({ left: Number(l), bottom: Math.max.apply(null, arr), n: arr.length }));
    colBalance = { cols, diff: cols.length > 1 ? r1(Math.max.apply(null, cols.map(c=>c.bottom)) - Math.min.apply(null, cols.map(c=>c.bottom))) : 0 };
  }

  // --- sıfır değerler
  const zeros = leafs.filter((el) => /^(0|₺0|₺0,00|%0|€0,00)$/.test((el.textContent||'').trim()))
    .map((el) => ({ t: (el.textContent||'').trim(), color: getComputedStyle(el).color, cls: (el.getAttribute('class')||'').slice(0,50) }));

  // --- font boyutu kademeleri (>=6 örnek)
  const fs = {};
  Array.from(main.querySelectorAll('*')).forEach((el) => {
    if (!vis(el) || el.children.length > 0) return;
    if (!(el.textContent||'').trim()) return;
    const s = getComputedStyle(el).fontSize; fs[s] = (fs[s]||0)+1;
  });

  return {
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    sections: sectionInfo, sectionCount: sections.length,
    rows: { n: rowHeights.length, min: Math.min.apply(null, rowHeights.concat([9999])), max: Math.max.apply(null, rowHeights.concat([0])), heights: Array.from(new Set(rowHeights)).sort((a,b)=>a-b) },
    dupeRows,
    tabular: { leafsWithDigits: leafs.length, nonTab: nonTab.length, sample: nonTab.slice(0, 12) },
    badges: { n: badges.length, filled: badgeFilled, unfilled: badges.length - badgeFilled, list: badges.slice(0, 14) },
    empties, rightEdges, colBalance, zeros: zeros.slice(0, 14), fontSizes: fs,
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  mkdirSync(OUT, { recursive: true });
  const out: Record<string, unknown> = {};
  try {
    for (const as of ROLES) {
      for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const ctx = await browser.newContext({
          viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500,
          locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
        });
        const page = await ctx.newPage();
        await openRoute(page, { base, route: '/kokpit', as });
        out[`${as}-${vp.width}`] = await page.evaluate(SRC);
        await ctx.close();
        console.error(`✓ ${as} ${vp.width}`);
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r10.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: probe-r10.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
