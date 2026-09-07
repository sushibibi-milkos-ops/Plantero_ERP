/** Tur 12: boş arama durumu + gerçek Tab ile odak halkası + hover geri bildirimi. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const OUT = 'artifacts/critic';

async function main() {
  const browser = await launchBrowser();
  const res: Record<string, unknown> = {};
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();

  // 1) boş arama sonucu (sevkiyatlar + gtip)
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['gtip', '/ihracat/gtip'], ['kurlar', '/ihracat/kurlar']] as Array<[string, string]>) {
    await openRoute(page, { base: BASE, route, as: 'admin' });
    const input = page.locator('input[type="search"], input[placeholder*="ara"]').first();
    await input.fill('zzzyokboyle');
    await page.waitForTimeout(700);
    res[`bos:${k}`] = await page.evaluate(() => {
      const main2 = document.querySelector('main');
      const txt = (main2?.textContent ?? '').replace(/\s+/g, ' ');
      const icons = main2 ? main2.querySelectorAll('svg').length : 0;
      return { hasEmpty: /Eşleşen kayıt yok|Kayıt bulunamadı|bulunamadı|sonuç yok/i.test(txt), snippet: txt.slice(txt.search(/Eşleşen|bulunamadı|sonuç/i) - 40, txt.search(/Eşleşen|bulunamadı|sonuç/i) + 160), icons };
    });
    await page.screenshot({ path: `${OUT}/ihracat-r12-bos-${k}.png`, animations: 'disabled' });
  }

  // 2) gerçek Tab ile odak halkası (sevkiyatlar araç çubuğu)
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  const rings: unknown[] = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, label: (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, ring: cs.boxShadow.slice(0, 70) };
    });
    if (r) rings.push(r);
  }
  res.focusChain = rings;

  // 3) satır hover (tıklanabilir liste)
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('table tbody tr') as HTMLElement).backgroundColor);
  await page.locator('table tbody tr').first().hover();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('table tbody tr') as HTMLElement).backgroundColor);
  res.rowHover = { before, after, changed: before !== after };

  await ctx.close();
  await browser.close();
  writeFileSync(`${OUT}/probe-ihracat-r12d.json`, JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
