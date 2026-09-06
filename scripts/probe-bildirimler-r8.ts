/** Tur 8 kritik ölçüm probu — /onaylar (admin) ve /bildirimler (depo).
 *   pnpm tsx scripts/probe-bildirimler-r8.ts  → artifacts/critic/probe-bildirimler-r8.json */
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
      deviceScaleFactor: 1, isMobile: vp.mobile, hasTouch: vp.mobile,
      locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
    });
    const page = await ctx.newPage();
    await openRoute(page, { route, as, base, dark: false });
    const out = await page.evaluate(fn);
    await ctx.close();
    return out;
  } finally { await browser.close(); }
}

const FONT_LADDER = `
  const fontLadder = (() => {
    const scope = document.querySelector('main') || document.body;
    const m = {};
    scope.querySelectorAll('*').forEach((el) => {
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (el.closest('.sr-only') || (el.className && String(el.className).includes('sr-only'))) return;
      const k = Math.round(parseFloat(cs.fontSize));
      (m[k] = m[k] || []).push(((el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,26)) + ' [' + cs.fontWeight + ']');
    });
    return m;
  })();
`;

const APPROVALS = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  ${FONT_LADDER}
  const rows = Array.from(document.querySelectorAll('[role="option"]'));
  const inner = rows.map((r) => r.firstElementChild);
  const amounts = rows.map((r) => r.querySelector('span[class*="w-28"]'));
  const amountRightGap = amounts.map((a, i) => a && inner[i] ? r1(inner[i].getBoundingClientRect().right - a.getBoundingClientRect().right - parseFloat(getComputedStyle(inner[i]).paddingRight)) : null).filter((x) => x !== null);
  const tablist = document.querySelector('[role="tablist"]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')) : [];
  const tcs = tablist ? getComputedStyle(tablist) : null;
  const hint = Array.from(document.querySelectorAll('main p, main div')).find((e) => /gezin/.test(e.textContent||'') && (e.textContent||'').length < 60);
  const hintRect = hint ? hint.getBoundingClientRect() : null;
  const tabularOk = rows.map((r) => { const a = r.querySelector('span[class*="w-28"]'); return a ? getComputedStyle(a).fontVariantNumeric : null; });
  const list = document.querySelector('[role="listbox"]');
  return {
    viewport: [innerWidth, innerHeight],
    rowCount: rows.length,
    rowHeights: rows.map((r) => r1(r.getBoundingClientRect().height)),
    rowsFullyInFirstScreen: rows.filter((r) => r.getBoundingClientRect().bottom <= innerHeight).length,
    amountRightGap,
    amountFontVariant: [...new Set(tabularOk)],
    listScrollWidth: list ? list.scrollWidth : null,
    listClientWidth: list ? list.clientWidth : null,
    tablist: tablist ? { scrollWidth: tablist.scrollWidth, clientWidth: tablist.clientWidth, maskImage: tcs.maskImage, lastTabRight: r1(tabs[tabs.length-1].getBoundingClientRect().right), tabHeights: tabs.map((t) => r1(t.getBoundingClientRect().height)) } : null,
    keyboardHint: hint ? { display: getComputedStyle(hint).display, w: r1(hintRect.width), h: r1(hintRect.height), top: r1(hintRect.top), text: (hint.textContent||'').trim().slice(0,40) } : null,
    docOverflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    fontLadder: Object.fromEntries(Object.entries(fontLadder).map(([k,v]) => [k, v.length])),
    fontSamples: Object.fromEntries(Object.entries(fontLadder).map(([k,v]) => [k, v.slice(0,3)])),
  };
})()`;

const NOTIFS = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  ${FONT_LADDER}
  const list = document.querySelector('main ul');
  const items = list ? Array.from(list.children) : [];
  const icons = items.map((li) => { const s = li.querySelector('svg'); if (!s) return null; const cs = getComputedStyle(s); return cs.color + '|' + r1(s.getBoundingClientRect().width) + '|' + (s.getAttribute('class')||'').slice(0,40); });
  const dots = items.map((li) => { const d = li.querySelector('span[class*="rounded-full"]'); return d ? getComputedStyle(d).backgroundColor : null; });
  const bgs = items.map((li) => getComputedStyle(li).backgroundColor);
  const main = document.querySelector('main');
  const tablist = document.querySelector('[role="tablist"]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')) : [];
  return {
    viewport: [innerWidth, innerHeight],
    rowCount: items.length,
    rowHeights: items.map((li) => r1(li.getBoundingClientRect().height)),
    listWidth: list ? r1(list.getBoundingClientRect().width) : null,
    mainWidth: main ? r1(main.getBoundingClientRect().width) : null,
    distinctIconStyles: [...new Set(icons)].length,
    iconStyles: [...new Set(icons)],
    distinctDots: [...new Set(dots)].length,
    dotColors: [...new Set(dots)],
    distinctRowBgs: [...new Set(bgs)].length,
    rowBgs: [...new Set(bgs)],
    tabs: tabs.map((t) => r1(t.getBoundingClientRect().height)),
    docOverflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    fontLadder: Object.fromEntries(Object.entries(fontLadder).map(([k,v]) => [k, v.length])),
    fontSamples: Object.fromEntries(Object.entries(fontLadder).map(([k,v]) => [k, v.slice(0,3)])),
  };
})()`;

async function main() {
  const out: Record<string, unknown> = {};
  out['onaylar-1440'] = await probe('/onaylar', 'admin', DESKTOP, APPROVALS);
  out['onaylar-390'] = await probe('/onaylar', 'admin', MOBILE, APPROVALS);
  out['bildirimler-1440'] = await probe('/bildirimler', 'depo', DESKTOP, NOTIFS);
  out['bildirimler-390'] = await probe('/bildirimler', 'depo', MOBILE, NOTIFS);
  const p = resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r8.json');
  mkdirSync(resolve(process.cwd(), 'artifacts/critic'), { recursive: true });
  writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(p);
}
main().catch((e) => { console.error(e); process.exit(1); });
