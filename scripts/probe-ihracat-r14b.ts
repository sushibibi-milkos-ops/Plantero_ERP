/** Tur 14 ihracat: klavye odak halkası, boş durum, koyu tema, kurlar Kaynak sütunu. */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();
const OUT = 'artifacts/screens/ihracat-r14-states';

async function main() {
  mkdirSync(OUT, { recursive: true });
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
    // gerçek klavye ile main içindeki ilk 8 odaklanabilir öğeyi gez
    await page.evaluate(() => (document.querySelector('main') as HTMLElement)?.setAttribute('tabindex', '-1'));
    await page.evaluate(() => (document.querySelector('main') as HTMLElement)?.focus());
    const rings: any[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const inMain = !!el.closest('main');
        return { tag: el.tagName, txt: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24), inMain, outlineW: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, ring: cs.boxShadow.slice(0, 60), h: Math.round(el.getBoundingClientRect().height) };
      });
      if (r) rings.push(r);
    }
    res[k] = { rings };
    await ctx.close();
  }

  // boş durum: sonuçsuz arama (3 liste)
  for (const [k, route, ph] of [['sevkiyatlar', '/ihracat/sevkiyatlar', 'Sevkiyat no'], ['belgeler', '/ihracat/belgeler', 'Belge, sevkiyat'], ['kurlar', '/ihracat/kurlar', 'Para birimi'], ['gtip', '/ihracat/gtip', 'SKU veya']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    await p.locator(`input[placeholder*="${ph}"]`).first().fill('zzzqqq');
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${OUT}/bos-${k}-1440.png`, fullPage: true, animations: 'disabled' });
    res[`bos:${k}`] = await p.evaluate(() => {
      const m = document.querySelector('main') as HTMLElement;
      return { text: (m.textContent ?? '').replace(/\s+/g, ' ').slice(-260), svg: m.querySelectorAll('svg').length, btns: Array.from(m.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()).filter(Boolean).slice(-4) };
    });
    await ctx.close();
  }

  // koyu tema
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['kurlar', '/ihracat/kurlar'], ['detay', `/ihracat/sevkiyatlar/${SHIP}`]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    await p.screenshot({ path: `${OUT}/dark-${k}-1440.png`, fullPage: true, animations: 'disabled' });
    res[`dark:${k}`] = await p.evaluate(() => ({ htmlClass: document.documentElement.className, bodyBg: getComputedStyle(document.body).backgroundColor, mainColor: getComputedStyle(document.querySelector('main')!).color }));
    await ctx.close();
  }

  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r14b.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
