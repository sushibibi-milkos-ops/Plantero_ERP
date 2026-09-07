/**
 * Tur 10 kokpit prob-B: kokpit/loading.tsx iskeletini YUMUŞAK gezinmede yakala ve GERÇEK sayfa
 * anatomisiyle sayısal olarak karşılaştır (Tur 9 P1 kokpit-loading-skeleton-mismatch-09 doğrulaması).
 * Aynı context içinde önce iskelet, sonra yerleşen gerçek sayfa ölçülür → fark = düzen sıçraması.
 *   tsx scripts/probe-kokpit-r10b.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r10');

/** İskelet imzası: KPI şeridi + bölüm kartı + satır bandı ölçüleri. */
const SKEL = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const busy = document.querySelector('[aria-busy]');
  if (!busy) return null;
  const kids = Array.from(busy.children);
  const strip = kids.find((c) => /overflow-x-auto/.test(c.getAttribute('class') || ''));
  const grid = kids.find((c) => /grid/.test(c.getAttribute('class') || ''));
  const cardEls = grid ? Array.from(grid.querySelectorAll(':scope > div > div')) : [];
  const card = cardEls[0] || null;
  const cardCs = card ? getComputedStyle(card) : null;
  const headEl = card ? card.querySelector(':scope > div') : null;
  const rowEls = card ? Array.from(card.querySelectorAll(':scope > div:nth-child(2) > div')) : [];
  const stripCs = strip ? getComputedStyle(strip) : null;
  const stripCards = strip ? Array.from(strip.children) : [];
  return {
    stripH: strip ? r1(strip.getBoundingClientRect().height) : null,
    stripBorder: stripCs ? stripCs.borderTopWidth + '/' + stripCs.borderLeftWidth : null,
    stripRadius: stripCs ? stripCs.borderTopLeftRadius : null,
    stripOverflowX: stripCs ? stripCs.overflowX : null,
    stripCardH: stripCards.map((c) => r1(c.getBoundingClientRect().height)),
    stripCardW: stripCards.map((c) => r1(c.getBoundingClientRect().width)),
    stripCardBorderL: stripCards.map((c) => getComputedStyle(c).borderLeftWidth),
    stripCardRadius: stripCards.map((c) => getComputedStyle(c).borderTopLeftRadius),
    cardRadius: cardCs ? cardCs.borderTopLeftRadius : null,
    cardBorder: cardCs ? cardCs.borderTopWidth : null,
    headerH: headEl ? r1(headEl.getBoundingClientRect().height) : null,
    rowH: rowEls.map((r) => r1(r.getBoundingClientRect().height)),
    cardCount: cardEls.length,
    docH: r1(document.documentElement.scrollHeight),
  };
})()`;

/** Gerçek sayfa imzası — iskelet imzasının BİREBİR karşılığı. */
const REAL = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const strip = main.querySelector('[class*="overflow-x-auto"]');
  const stripCs = strip ? getComputedStyle(strip) : null;
  const stripCards = strip ? Array.from(strip.children) : [];
  const sec = Array.from(main.querySelectorAll('section')).filter(vis)[0] || null;
  const secCs = sec ? getComputedStyle(sec) : null;
  const head = sec ? sec.querySelector('header') : null;
  const rows = Array.from(main.querySelectorAll('a,div')).filter((el) => {
    if (!vis(el)) return false;
    const cs = getComputedStyle(el);
    return cs.display === 'flex' && cs.paddingLeft === '16px' && cs.fontSize === '13px';
  }).map((el) => r1(el.getBoundingClientRect().height));
  return {
    stripH: strip ? r1(strip.getBoundingClientRect().height) : null,
    stripBorder: stripCs ? stripCs.borderTopWidth + '/' + stripCs.borderLeftWidth : null,
    stripRadius: stripCs ? stripCs.borderTopLeftRadius : null,
    stripOverflowX: stripCs ? stripCs.overflowX : null,
    stripCardH: stripCards.map((c) => r1(c.getBoundingClientRect().height)),
    stripCardW: stripCards.map((c) => r1(c.getBoundingClientRect().width)),
    stripCardBorderL: stripCards.map((c) => getComputedStyle(c).borderLeftWidth),
    stripCardRadius: stripCards.map((c) => getComputedStyle(c).borderTopLeftRadius),
    cardRadius: secCs ? secCs.borderTopLeftRadius : null,
    cardBorder: secCs ? secCs.borderTopWidth : null,
    headerH: head ? r1(head.getBoundingClientRect().height) : null,
    rowH: Array.from(new Set(rows)).sort((a, b) => a - b),
    cardCount: Array.from(main.querySelectorAll('section')).filter(vis).length,
    docH: r1(document.documentElement.scrollHeight),
  };
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  mkdirSync(OUT, { recursive: true });
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({
        viewport: vp, deviceScaleFactor: 2, isMobile: vp.width < 500, hasTouch: vp.width < 500,
        locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
      });
      const page = await ctx.newPage();
      await page.route('**/*', async (route) => {
        if (/\/kokpit(\?|$)/.test(route.request().url())) await new Promise((r) => setTimeout(r, 6000));
        await route.continue();
      });
      await login(page, base, resolveAccount('admin'), '/bildirimler');
      await page.waitForTimeout(1500);
      const clicked = await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('a[href="/kokpit"]'))[0] as HTMLAnchorElement | undefined;
        if (!a) return false;
        a.click();
        return true;
      });
      let skel: unknown = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 20_000) {
        const r = await page.evaluate(SKEL).catch(() => null);
        if (r) {
          skel = r;
          await page.screenshot({ path: resolve(OUT, `skeleton-${vp.width}.png`), animations: 'disabled' });
          break;
        }
        await page.waitForTimeout(15);
      }
      await page.waitForFunction(() => document.querySelectorAll('[aria-busy]').length === 0, null, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const real = await page.evaluate(REAL);
      out[String(vp.width)] = { clicked, skel, real };
      await ctx.close();
      console.error(`✓ ${vp.width}: iskelet=${skel ? 'yakalandı' : 'YOK'}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r10b.json'), JSON.stringify(out, null, 2));
  console.error('yazıldı: probe-r10b.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
