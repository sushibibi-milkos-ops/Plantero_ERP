/**
 * Tur 5 kritik ölçüm probu — /onaylar ve /bildirimler.
 *   pnpm tsx scripts/probe-bildirimler-r5.ts
 * Çıktı: artifacts/critic/probe-bildirimler-r5.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

type VP = { width: number; height: number; mobile: boolean };
const DESKTOP: VP = { width: 1440, height: 900, mobile: false };
const MOBILE: VP = { width: 390, height: 844, mobile: true };

async function probe(route: string, as: string, vp: VP, fn: string) {
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
    });
    const page = await ctx.newPage();
    await openRoute(page, { route, as, base, dark: false });
    const out = await page.evaluate(fn);
    await ctx.close();
    return out;
  } finally {
    await browser.close();
  }
}

const APPROVALS = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const rows = Array.from(document.querySelectorAll('[role="option"]'));
  const titles = rows.map((r) => r.querySelector('span.truncate'));
  const amounts = rows.map((r) => r.querySelector('span[class*="w-28"]'));
  const main = document.querySelector('main');
  const mainRect = main.getBoundingClientRect();
  const fonts = {};
  for (const el of Array.from(main.querySelectorAll('*'))) {
    let hasText = false;
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && n.textContent.trim()) { hasText = true; break; }
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rc = el.getBoundingClientRect();
    if (rc.width <= 0 || rc.height <= 0) continue;
    const k = String(r1(parseFloat(cs.fontSize)));
    fonts[k] = (fonts[k] || 0) + 1;
  }
  const tablist = document.querySelector('[role="tablist"]');
  const nav = document.querySelector('nav[class*="fixed"], [data-slot="mobile-nav"], footer nav');
  const fixedBottom = Array.from(document.querySelectorAll('body *')).filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') return false;
    const rc = el.getBoundingClientRect();
    return rc.height > 20 && rc.bottom >= innerHeight - 2 && rc.width > innerWidth * 0.7;
  }).map((el) => ({ tag: el.tagName.toLowerCase(), h: r1(el.getBoundingClientRect().height), cls: (el.className || '').toString().slice(0, 60) }));
  const lastRow = rows[rows.length - 1];
  return {
    rowCount: rows.length,
    rowHeights: rows.map((r) => r1(r.getBoundingClientRect().height)),
    titleWidths: titles.map((t) => (t ? r1(t.getBoundingClientRect().width) : null)),
    truncatedTitles: titles.filter((t) => t && t.scrollWidth > t.clientWidth + 1).length,
    truncatedTitleTexts: titles.filter((t) => t && t.scrollWidth > t.clientWidth + 1).map((t) => t.textContent.slice(0, 40)),
    amountWidths: amounts.map((a) => (a ? r1(a.getBoundingClientRect().width) : null)),
    amountRightGap: amounts.filter(Boolean).map((a) => {
      const row = a.closest('[role="option"]');
      return r1(row.getBoundingClientRect().right - a.getBoundingClientRect().right);
    }).slice(0, 3),
    amountTabular: amounts.filter(Boolean).map((a) => getComputedStyle(a).fontVariantNumeric).slice(0, 2),
    mainFonts: fonts,
    mainRect: { x: r1(mainRect.x), w: r1(mainRect.width) },
    mainPaddingBottom: getComputedStyle(main).paddingBottom,
    listWidth: r1(document.querySelector('[role="listbox"]').getBoundingClientRect().width),
    tablist: tablist ? { w: r1(tablist.getBoundingClientRect().width), scrollW: tablist.scrollWidth, clientW: tablist.clientWidth, overflow: tablist.scrollWidth > tablist.clientWidth + 1 } : null,
    tabHeights: Array.from(document.querySelectorAll('[role="tab"]')).map((t) => r1(t.getBoundingClientRect().height)),
    fixedBottom,
    lastRowBottomVsViewport: lastRow ? r1(lastRow.getBoundingClientRect().bottom) : null,
    docScrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    selectedRowH: r1((rows.find((r) => r.getAttribute('aria-selected') === 'true') || rows[0]).getBoundingClientRect().height),
    buttonHeights: Array.from(document.querySelectorAll('[role="option"][aria-selected="true"] button, [role="option"][aria-selected="true"] a[data-slot="button"]')).map((b) => r1(b.getBoundingClientRect().height)),
    buttonFonts: Array.from(document.querySelectorAll('[role="option"][aria-selected="true"] button, [role="option"][aria-selected="true"] a[data-slot="button"]')).map((b) => getComputedStyle(b).fontSize),
  };
})()`;

const NOTIFS = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const items = Array.from(document.querySelectorAll('main ul > li'));
  const main = document.querySelector('main');
  const fonts = {};
  for (const el of Array.from(main.querySelectorAll('*'))) {
    let hasText = false;
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && n.textContent.trim()) { hasText = true; break; }
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rc = el.getBoundingClientRect();
    if (rc.width <= 0 || rc.height <= 0) continue;
    const k = String(r1(parseFloat(cs.fontSize)));
    fonts[k] = (fonts[k] || 0) + 1;
  }
  const list = document.querySelector('main ul');
  const btn = Array.from(document.querySelectorAll('main button')).find((b) => b.textContent.includes('okundu işaretle'));
  return {
    count: items.length,
    heights: items.map((i) => r1(i.getBoundingClientRect().height)),
    listWidth: list ? r1(list.getBoundingClientRect().width) : null,
    mainWidth: r1(main.getBoundingClientRect().width),
    mainPaddingBottom: getComputedStyle(main).paddingBottom,
    mainFonts: fonts,
    tabHeights: Array.from(document.querySelectorAll('[role="tab"]')).map((t) => r1(t.getBoundingClientRect().height)),
    markAll: btn ? { h: r1(btn.getBoundingClientRect().height), w: r1(btn.getBoundingClientRect().width), font: getComputedStyle(btn).fontSize } : null,
    bodyClamped: items.map((i) => { const p = i.querySelector('p'); return p ? p.scrollHeight > p.clientHeight + 1 : null; }),
    titleFonts: items.map((i) => { const d = i.querySelector('div.min-w-0 > div > div'); return d ? getComputedStyle(d).fontSize + '/' + getComputedStyle(d).fontWeight : null; }),
    timeFonts: items.map((i) => { const s = i.querySelector('span[class*="text-[11px]"]'); return s ? getComputedStyle(s).fontSize : null; }),
    docScroll: document.documentElement.scrollWidth + '/' + document.documentElement.clientWidth,
  };
})()`;

async function main() {
  const out: Record<string, unknown> = {};
  out['onaylar@1440'] = await probe('/onaylar', 'admin', DESKTOP, APPROVALS);
  out['onaylar@390'] = await probe('/onaylar', 'admin', MOBILE, APPROVALS);
  out['bildirimler@1440'] = await probe('/bildirimler', 'depo', DESKTOP, NOTIFS);
  out['bildirimler@390'] = await probe('/bildirimler', 'depo', MOBILE, NOTIFS);
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-bildirimler-r5.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
