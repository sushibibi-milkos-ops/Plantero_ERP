/** Tur 11: gerçek klavye Tab odak halkası, tabular-nums yaprak seviyesi, boş arama durumu, mobil dokunma hedefleri. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();

async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  const SHIP = id('EXP-2026-000002');
  const routes: Array<[string, string]> = [
    ['sevkiyatlar', '/ihracat/sevkiyatlar'],
    ['belgeler', '/ihracat/belgeler'],
    ['kurlar', '/ihracat/kurlar'],
    ['gtip', '/ihracat/gtip'],
    ['yeni', '/ihracat/sevkiyatlar/yeni'],
    ['detay', `/ihracat/sevkiyatlar/${SHIP}`],
  ];
  for (const [k, route] of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    // gerçek klavye Tab: main içindeki ilk odaklanabilir elemana ulaşana kadar
    const focus: any[] = [];
    for (let i = 0; i < 26; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const inMain = !!el.closest('main');
        const cs = getComputedStyle(el);
        return { inMain, tag: el.tagName, label: (el.textContent ?? '').trim().slice(0, 24), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, offset: cs.outlineOffset, ring: cs.boxShadow.slice(0, 60) };
      });
      if (f?.inMain) { focus.push(f); if (focus.length >= 3) break; }
    }
    // tabular-nums yaprak seviyesi: sayı içeren hücrelerin font-variant-numeric
    const nums = await page.evaluate(() => {
      const out: any[] = [];
      document.querySelectorAll('table tbody td, [class*="text-2xl"], [class*="text-xl"]').forEach((el) => {
        const t = (el.textContent ?? '').trim();
        if (!/[0-9]/.test(t)) return;
        const leaf = (el.querySelector('*') as HTMLElement) ?? (el as HTMLElement);
        const cs = getComputedStyle(leaf);
        out.push({ t: t.slice(0, 22), fvn: cs.fontVariantNumeric, ff: cs.fontFamily.split(',')[0], align: getComputedStyle(el as HTMLElement).textAlign });
      });
      return out.slice(0, 40);
    });
    res[k] = { focus, numsSample: nums.filter((n: any) => !/tabular/.test(n.fvn) && !/mono|Mono/.test(n.ff)).slice(0, 12), numsTotal: nums.length };
    await ctx.close();
  }

  // boş arama durumu (4 liste)
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p2 = await ctx2.newPage();
  const empty: any = {};
  for (const [k, route] of routes.slice(0, 4)) {
    await openRoute(p2, { base: BASE, route, as: 'admin' });
    const input = p2.locator('main input[type="search"], main input[placeholder*="ara"]').first();
    await input.fill('zzzqqq');
    await p2.waitForTimeout(900);
    empty[k] = await p2.evaluate(() => {
      const m = document.querySelector('main') as HTMLElement;
      return { text: (m.textContent ?? '').replace(/\s+/g, ' ').slice(-260), svgInEmpty: m.querySelectorAll('svg').length };
    });
  }
  res.empty = empty;
  await ctx2.close();

  // mobil dokunma hedefleri (etkileşimli, görünür)
  const ctxm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const pm = await ctxm.newPage();
  const mob: any = {};
  for (const [k, route] of routes) {
    await openRoute(pm, { base: BASE, route, as: 'admin' });
    mob[k] = await pm.evaluate(() => {
      const bad: any[] = [];
      document.querySelectorAll('main a, main button, main [role="tab"], main input, main [role="combobox"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.opacity === '0') return;
        if ((el as HTMLElement).tagName === 'SELECT') return;
        if (r.height < 44 || r.width < 44) bad.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,40), t: (el.textContent ?? '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) });
      });
      return bad;
    });
  }
  res.mobileTouch = mob;
  await ctxm.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r11b.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
