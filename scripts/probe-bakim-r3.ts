/**
 * Tur 3 — bakım modülü ölçüm probu (docs/DESIGN-SCORECARD.md kural 1/6).
 * Açık bulguların yeniden ölçümü + yeni aday bulgular:
 *   KPI geometrisi / tableTop / rowsAboveFold, sıfır rengi, iç kap taşmaları,
 *   contentBottom-emptyBelow, sayı biçimi (ondalık + tabular-nums), dokunma hedefleri,
 *   kanban kart başlığı kırpması, boş sütun yüksekliği.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const r0 = (n: number) => Math.round(n);
  const out: Record<string, unknown> = {};
  const main = document.querySelector<HTMLElement>('main') ?? document.body;

  // --- iç kap yatay taşmaları
  const overflows: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 100) {
      overflows.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 90),
        sw: el.scrollWidth,
        cw: el.clientWidth,
        ox: getComputedStyle(el).overflowX,
        text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 50),
      });
    }
  }
  out.overflows = overflows;

  // --- içerik alt kenarı / boş alan
  let bottom = 0;
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (el.textContent || '').trim()) bottom = Math.max(bottom, r.bottom + window.scrollY);
    if (el.tagName === 'SVG' || el.tagName === 'svg') bottom = Math.max(bottom, r.bottom + window.scrollY);
  }
  out.contentBottom = r0(bottom);
  out.emptyBelow = r0(Math.max(0, window.innerHeight - bottom));

  // --- tablo geometrisi
  const table = main.querySelector<HTMLElement>('table');
  if (table) {
    const holder = table.parentElement as HTMLElement | null;
    out.table = {
      top: r0(table.getBoundingClientRect().top + window.scrollY),
      w: r0(table.getBoundingClientRect().width),
      sw: table.scrollWidth,
      holderCw: holder ? holder.clientWidth : null,
      holderSw: holder ? holder.scrollWidth : null,
      headers: Array.from(table.querySelectorAll('thead th')).map((th) => ({
        t: (th.textContent || '').trim().slice(0, 14),
        w: r0(th.getBoundingClientRect().width),
        right: r0(th.getBoundingClientRect().right),
        clipped: th.scrollWidth - th.clientWidth > 1,
      })),
    };
    const rows = Array.from(table.querySelectorAll<HTMLElement>('tbody tr'));
    out.rowCount = rows.length;
    out.rowsAboveFold = rows.filter((tr) => tr.getBoundingClientRect().bottom <= window.innerHeight).length;
  }

  // --- KPI kartları (19/22px tabular değer düğümünün kutusu)
  const kpiSet = new Set<HTMLElement>();
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs === 22 || fs === 19 || fs === 24) {
      const box = el.closest('[class*="rounded-xl"], [class*="rounded-lg"]') as HTMLElement | null;
      if (box && box !== main) kpiSet.add(box);
    }
  }
  out.kpi = Array.from(kpiSet).map((el) => ({
    h: r0(el.getBoundingClientRect().height),
    w: r0(el.getBoundingClientRect().width),
    top: r0(el.getBoundingClientRect().top + window.scrollY),
    text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 34),
  }));

  // --- araç çubuğu üst kenarı (ilk görünür input)
  const input = main.querySelector<HTMLElement>('input:not([type="hidden"])');
  out.toolbarTop = input ? r0(input.getBoundingClientRect().top + window.scrollY) : null;

  // --- sayı biçimi: metni /^-?\d[\d.,]*\s*\D{0,6}$/ olan görünür düğümler
  const numeric: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    let own = '';
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) own += n.textContent ?? '';
    own = own.trim();
    if (!own || own.length > 22) continue;
    if (!/\d/.test(own)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const dec = /\.(\d{3,})\b/.exec(own);
    if (dec || /\d\.\d{3}/.test(own)) {
      numeric.push({ text: own, tabular: cs.fontVariantNumeric, color: cs.color, decimals: dec ? dec[1]!.length : null });
    }
  }
  out.longDecimals = numeric;

  // --- 44px altı görünür etkileşimli hedefler (mobil kriter 9)
  const small: unknown[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input:not([type=hidden]), [role="button"], [role="link"], [role="tab"], [tabindex]:not([tabindex="-1"])'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.width < 44 || r.height < 44) small.push({ t: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 26), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, tag: el.tagName.toLowerCase() });
  }
  out.small = small;

  // --- satır/kart yükseklikleri
  const cards = Array.from(main.querySelectorAll<HTMLElement>('ul > li')).filter((el) => el.getBoundingClientRect().height > 0);
  out.cards = cards.slice(0, 6).map((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);

  // --- kırpılan metinler (truncate / line-clamp ile kesilen)
  const clipped: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    if (el.children.length > 0) continue;
    if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 40) {
      clipped.push({ t: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth });
    }
  }
  out.clippedTexts = clipped.slice(0, 20);

  return out;
};

async function main() {
  const argv = process.argv.slice(2);
  const routes: string[] = [];
  let viewport = { width: 1440, height: 900 };
  let click: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--viewport') { const m = /^(\d+)x(\d+)$/.exec(argv[++i] ?? ''); if (m) viewport = { width: +m[1]!, height: +m[2]! }; }
    else if (a === '--click') click = argv[++i] ?? null;
    else if (a.startsWith('/')) routes.push(a);
  }
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const result: Record<string, unknown> = {};
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route, as: 'admin', base });
    if (click) { try { await page.locator(click).first().click({ timeout: 5000 }); await page.waitForTimeout(700); } catch { /* yok */ } }
    // tsx/esbuild `keepNames` sarmalayıcısı sayfa bağlamında tanımlı değil — no-op olarak ekle
    await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name = (f: unknown) => f; });
    result[`${route} @${viewport.width}x${viewport.height}${click ? ` [click ${click}]` : ''}`] = await page.evaluate(collect);
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(result, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
