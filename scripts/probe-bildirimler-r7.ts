/**
 * Tur 7 kritik ölçüm probu — /onaylar ve /bildirimler.
 *   pnpm tsx scripts/probe-bildirimler-r7.ts
 * Çıktı: artifacts/critic/probe-bildirimler-r7.json
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
      const k = Math.round(parseFloat(cs.fontSize));
      (m[k] = m[k] || []).push(((el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,28)) + ' [' + cs.fontWeight + ']');
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
  const badges = rows.map((r) => { const b = r.querySelector('span[class*="rounded"]'); return b ? getComputedStyle(b).backgroundColor + '|' + getComputedStyle(b).color : null; });
  return {
    fontLadder,
    rowCount: rows.length,
    rowHeights: rows.map((r) => r1(r.getBoundingClientRect().height)),
    amountRightGap,
    amountRightGapMax: amountRightGap.length ? Math.max(...amountRightGap) : null,
    rowInnerWidth: inner[0] ? r1(inner[0].getBoundingClientRect().width) : null,
    tablist: tablist ? {
      scrollWidth: tablist.scrollWidth, clientWidth: tablist.clientWidth,
      overflow: tablist.scrollWidth > tablist.clientWidth,
      maskImage: tcs.maskImage, webkitMaskImage: tcs.webkitMaskImage,
      lastTabRight: tabs.length ? r1(tabs[tabs.length-1].getBoundingClientRect().right) : null,
      tabHeights: tabs.map((t) => r1(t.getBoundingClientRect().height)),
      viewportW: window.innerWidth,
    } : null,
    listboxScroll: (() => { const lb = document.querySelector('[role="listbox"]'); return lb ? { scrollWidth: lb.scrollWidth, clientWidth: lb.clientWidth } : null; })(),
    rowsFitFirstScreen: rows.filter((r) => r.getBoundingClientRect().bottom <= window.innerHeight).length,
    viewportH: window.innerHeight,
    distinctBadgeStyles: new Set(badges.filter(Boolean)).size,
    badges,
    tabularNums: (() => {
      const els = Array.from(document.querySelectorAll('[role="option"] span'));
      const nums = els.filter((e) => /[₺%]|\\d{1,3}[.,]\\d/.test(e.textContent||''));
      return nums.slice(0,6).map((e) => (e.textContent||'').trim().slice(0,14) + ' → ' + getComputedStyle(e).fontVariantNumeric);
    })(),
    focusRing: (() => {
      const r = document.querySelector('[role="option"]');
      if (!r) return null;
      r.focus && r.focus();
      const cs = getComputedStyle(r);
      return { outline: cs.outlineStyle + ' ' + cs.outlineWidth, boxShadow: cs.boxShadow.slice(0,80) };
    })(),
  };
})()`;

const NOTIFS = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  ${FONT_LADDER}
  const list = document.querySelector('ul.divide-y') || document.querySelector('ul');
  const lis = list ? Array.from(list.children) : [];
  const icons = lis.map((li) => li.querySelector('svg'));
  const styles = icons.map((s) => s ? getComputedStyle(s).color + '|' + r1(s.getBoundingClientRect().width) : null);
  const dots = lis.map((li) => { const d = li.querySelector('span[aria-hidden][class*="rounded-full"]'); return d ? getComputedStyle(d).backgroundColor : null; });
  const rowBgs = lis.map((li) => { const c = li.firstElementChild && li.firstElementChild.firstElementChild; return c ? getComputedStyle(c).backgroundColor : null; });
  const titles = lis.map((li) => (li.textContent||'').replace(/\\s+/g,' ').trim().slice(0,44));
  const main = document.querySelector('main') || document.body;
  return {
    fontLadder,
    rowCount: lis.length,
    rowHeights: lis.map((li) => r1(li.getBoundingClientRect().height)),
    listWidth: list ? r1(list.getBoundingClientRect().width) : null,
    mainWidth: r1(main.getBoundingClientRect().width),
    iconStyles: styles,
    distinctIconStyles: new Set(styles.filter(Boolean)).size,
    dots, distinctDots: new Set(dots.filter(Boolean)).size,
    rowBgs, distinctRowBgs: new Set(rowBgs.filter(Boolean)).size,
    titles,
    rowsFitFirstScreen: lis.filter((li) => li.getBoundingClientRect().bottom <= window.innerHeight).length,
    viewportH: window.innerHeight,
    tabHeights: Array.from(document.querySelectorAll('[role="tab"]')).map((t) => r1(t.getBoundingClientRect().height)),
    tablistOverflow: (() => { const t = document.querySelector('[role="tablist"]'); return t ? { sw: t.scrollWidth, cw: t.clientWidth } : null; })(),
    markAllBtn: (() => { const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent||'').includes('okundu işaretle')); return b ? { h: r1(b.getBoundingClientRect().height), w: r1(b.getBoundingClientRect().width) } : null; })(),
    focusRing: (() => {
      const a = list && list.querySelector('a, [tabindex]');
      if (!a) return null;
      a.focus();
      const cs = getComputedStyle(a);
      return { outline: cs.outlineStyle + ' ' + cs.outlineWidth, boxShadow: cs.boxShadow.slice(0,90) };
    })(),
    bodyTabular: (() => {
      const p = list && list.querySelector('p');
      return p ? getComputedStyle(p).fontVariantNumeric : null;
    })(),
    timeStamps: lis.map((li) => { const s = li.querySelector('span[class*="tabular-nums"]'); return s ? { t: (s.textContent||'').trim(), w: r1(s.getBoundingClientRect().width), fvn: getComputedStyle(s).fontVariantNumeric } : null; }),
  };
})()`;

async function main() {
  const out: Record<string, unknown> = {};
  out['onaylar@1440'] = await probe('/onaylar', 'admin', DESKTOP, APPROVALS);
  out['onaylar@390'] = await probe('/onaylar', 'admin', MOBILE, APPROVALS);
  out['onaylar-empty@1440'] = await probe('/onaylar', 'kalite', DESKTOP, APPROVALS);
  out['bildirimler@1440'] = await probe('/bildirimler', 'depo', DESKTOP, NOTIFS);
  out['bildirimler@390'] = await probe('/bildirimler', 'depo', MOBILE, NOTIFS);
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-bildirimler-r7.json'), JSON.stringify(out, null, 2));
  console.log('ok');
}
void main();
