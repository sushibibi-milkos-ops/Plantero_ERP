/** Tur 13: gerçek Tab odak halkası, boş arama durumu, 390px dokunma hedefleri (detay dahil), tabular-nums. */
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

  // 1) gerçek Tab ile odak halkası (250ms bekleme — Tur 11 notu)
  for (const [k, route] of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    const seen: any[] = [];
    for (let i = 0; i < 26; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(60);
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const inMain = !!el.closest('main');
        const cs = getComputedStyle(el);
        return { tag: el.tagName, txt: (el.textContent ?? '').trim().slice(0, 24), inMain, outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, shadow: cs.boxShadow.slice(0, 120), border: cs.borderColor };
      });
      if (info?.inMain) seen.push(info);
      if (seen.length >= 6) break;
    }
    await page.waitForTimeout(250);
    res[`focus:${k}`] = seen;
    await ctx.close();
  }

  // 2) boş arama durumu
  for (const [k, route] of routes.filter(([k]) => !['yeni', 'detay'].includes(k))) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    const box = page.locator('main input[type="search"], main input[placeholder*="ara"]').first();
    await box.fill('zzzqqq-yok');
    await page.waitForTimeout(700);
    res[`empty:${k}`] = await page.evaluate(() => {
      const m = document.querySelector('main') as HTMLElement;
      const rows = m.querySelectorAll('tbody tr').length;
      const txt = (m.innerText || '').slice(-400);
      const svgAfterTable = m.querySelectorAll('svg').length;
      const btns = Array.from(m.querySelectorAll('button')).map((b) => b.textContent?.trim()).filter(Boolean).slice(-4);
      return { rows, tail: txt, svgCount: svgAfterTable, lastButtons: btns };
    });
    await page.screenshot({ path: `artifacts/critic/ihracat-r13-bos-${k}.png`, fullPage: false });
    await ctx.close();
  }

  // 3) 390px dokunma hedefleri (etkileşimli, görünür)
  const ctxm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const pm = await ctxm.newPage();
  const touch: any = {};
  for (const [k, route] of routes) {
    await openRoute(pm, { base: BASE, route, as: 'admin' });
    touch[k] = await pm.evaluate(() => {
      const bad: any[] = [];
      document.querySelectorAll('main a, main button, main input, main [role="tab"], main [role="button"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (getComputedStyle(el).visibility === 'hidden') return;
        if (r.height < 44 || r.width < 44) bad.push({ tag: el.tagName, txt: (el.textContent ?? '').trim().slice(0, 28), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
      });
      return bad;
    });
  }
  res.touch390 = touch;
  await ctxm.close();

  // 4) koyu tema (kurlar + sevkiyatlar)
  const ctxd = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'dark' });
  const pd = await ctxd.newPage();
  for (const [k, route] of [['kurlar', '/ihracat/kurlar'], ['detay', `/ihracat/sevkiyatlar/${SHIP}`]] as Array<[string, string]>) {
    await openRoute(pd, { base: BASE, route, as: 'admin' });
    await pd.screenshot({ path: `artifacts/critic/ihracat-r13-dark-${k}.png`, fullPage: false });
  }
  await ctxd.close();

  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r13b.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
