/** Tur 4 kritik probu — bildirimler modülü (/onaylar, /bildirimler). Yalnızca ölçüm, değişiklik yok. */
import type { Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

function collectOnaylar() {
  const rows = Array.from(document.querySelectorAll('[role="option"]'));
  const titleOf = (r: Element) => r.querySelector('span.truncate') as HTMLElement | null;
  const t0 = rows[1] ? titleOf(rows[1]!) : null;
  const kbd = document.querySelector('p:has(kbd)') as HTMLElement | null;
  const amt = rows[1]?.querySelector('span[class*="w-28"]') as HTMLElement | null;
  const icons = rows.map((r) => r.querySelector('svg')?.innerHTML.slice(0, 60) ?? '');
  const counts: Record<string, number> = {};
  for (const i of icons) counts[i] = (counts[i] ?? 0) + 1;
  const first = rows[0] as HTMLElement | undefined;
  const cs = first ? getComputedStyle(first) : null;
  const tl = document.querySelector('[role="tablist"]') as HTMLElement | null;
  return {
    rowCount: rows.length,
    rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
    rowCursor: rows[1] ? getComputedStyle(rows[1]!).cursor : null,
    selectedRowStyle: cs ? { outline: cs.outlineWidth + ' ' + cs.outlineStyle, boxShadow: cs.boxShadow, bg: cs.backgroundColor } : null,
    titleFontSize: t0 ? getComputedStyle(t0).fontSize + '/' + getComputedStyle(t0).fontWeight : null,
    titleWidth: t0 ? Math.round(t0.getBoundingClientRect().width) : null,
    truncatedTitleCount: rows.filter((r) => { const t = titleOf(r); return t ? t.scrollWidth > t.clientWidth + 1 : false; }).length,
    amountWidth: amt ? Math.round(amt.getBoundingClientRect().width) : null,
    amountText: amt ? amt.textContent : null,
    kbdHintVisible: kbd ? kbd.getBoundingClientRect().height > 0 : false,
    distinctRowIcons: Object.keys(counts).length,
    mostCommonIconCount: Math.max.apply(null, Object.keys(counts).map((k) => counts[k]!)),
    tablist: tl ? { scrollWidth: tl.scrollWidth, clientWidth: tl.clientWidth, clipped: tl.scrollWidth > tl.clientWidth + 1 } : null,
    rawMoney: document.body.innerText.match(/₺\d+\.\d{2}(?!\d)/g) || [],
    rawCode: document.body.innerText.match(/[a-zA-Z]+[A-Z][a-zA-Z]*\s*=\s*(true|false)/g) || [],
    rowsWithoutAmount: rows.filter((r) => !r.querySelector('span[class*="w-28"]')).length,
    rowsWithoutConfidence: rows.filter((r) => !r.querySelector('span[class*="rounded-full"]')).length,
  };
}

function collectBildirimler() {
  const items = Array.from(document.querySelectorAll('main ul > li'));
  const title = items[0]?.querySelector('div.min-w-0 > div > div') as HTMLElement | null;
  const body = items[0]?.querySelector('p') as HTMLElement | null;
  const list = document.querySelector('main ul') as HTMLElement | null;
  const icons = items.map((r) => r.querySelector('svg')?.innerHTML.slice(0, 60) ?? '');
  const c: Record<string, number> = {};
  for (const i of icons) c[i] = (c[i] ?? 0) + 1;
  const clamped = items.filter((r) => { const p = r.querySelector('p') as HTMLElement | null; return p ? p.scrollHeight > p.clientHeight + 1 : false; }).length;
  return {
    rowCount: items.length,
    rowHeights: items.map((r) => Math.round(r.getBoundingClientRect().height)),
    titleFont: title ? getComputedStyle(title).fontSize + '/' + getComputedStyle(title).fontWeight : null,
    bodyFont: body ? getComputedStyle(body).fontSize : null,
    bodyWidth: body ? Math.round(body.getBoundingClientRect().width) : null,
    listWidth: list ? Math.round(list.getBoundingClientRect().width) : null,
    distinctIcons: Object.keys(c).length,
    mostCommonIconCount: Math.max.apply(null, Object.keys(c).map((k) => c[k]!)),
    clampedBodies: clamped,
  };
}

function collectEmpty() {
  const main = document.querySelector('main');
  const box = document.querySelector('main div.max-w-3xl') as HTMLElement | null;
  return {
    hasList: !!document.querySelector('main ul > li'),
    text: (main ? main.innerText : '').replace(/\s+/g, ' ').slice(0, 260),
    boxWidth: box ? Math.round(box.getBoundingClientRect().width) : null,
  };
}

const wrap = (fn: () => unknown) => `(() => { const __name=(f)=>f; return (${fn.toString()})(); })()`;

async function run(page: Page, fn: () => unknown) {
  return (await page.evaluate(wrap(fn))) as Record<string, unknown>;
}

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  const vps = [{ width: 1440, height: 900, m: false }, { width: 390, height: 844, m: true }];

  for (const spec of [
    { route: '/onaylar', as: 'admin', fn: collectOnaylar, sel: '[role="option"]' },
    { route: '/bildirimler', as: 'depo', fn: collectBildirimler, sel: 'main ul > li a, main ul > li button' },
  ]) {
    for (const vp of vps) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.m, hasTouch: vp.m, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: spec.route, as: spec.as });
      const key = `${spec.route.slice(1)}-${vp.width}`;
      const data = await run(page, spec.fn);
      const target = page.locator(spec.sel).nth(1);
      if (await target.count()) {
        await target.evaluate((e: HTMLElement) => e.focus());
        data.focusStyle = await target.evaluate((e) => { const cs = getComputedStyle(e); return { outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow, focusVisible: e.matches(':focus-visible') }; });
        if (!vp.m) {
          const before = await target.evaluate((e) => getComputedStyle(e).backgroundColor);
          await target.hover();
          await page.waitForTimeout(200);
          const after = await target.evaluate((e) => getComputedStyle(e).backgroundColor);
          data.hover = { before, after, changes: before !== after };
        }
      }
      out[key] = data;
      await ctx.close();
    }
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bildirimler', as: 'admin' });
  out['bildirimler-empty-admin'] = await run(page, collectEmpty);
  await ctx.close();

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
