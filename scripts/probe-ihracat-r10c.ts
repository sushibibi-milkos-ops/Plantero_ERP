/** Tur 10c: tabular-nums, KPI ondalık tutarlılığı, koyu tema kontrastı, 1024 tablo taşması. */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['kurlar', '/ihracat/kurlar'], ['belgeler', '/ihracat/belgeler'], ['gtip', '/ihracat/gtip']] as Array<[string, string]>) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    res[k] = await page.evaluate(() => {
      const num = /[0-9]/;
      const cells: any[] = [];
      document.querySelectorAll('table tbody td').forEach((td) => {
        const t = (td.textContent ?? '').trim();
        if (!num.test(t)) return;
        const cs = getComputedStyle(td);
        cells.push({ t: t.slice(0, 18), fvn: cs.fontVariantNumeric, align: cs.textAlign, fam: cs.fontFamily.split(',')[0] });
      });
      const kpis: any[] = [];
      document.querySelectorAll('main *').forEach((el) => {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.fontSize) >= 22 && el.children.length === 0 && num.test(el.textContent ?? '')) kpis.push({ t: (el.textContent ?? '').trim(), size: cs.fontSize, fvn: cs.fontVariantNumeric, fam: cs.fontFamily.split(',')[0] });
      });
      const noFvn = cells.filter((c) => !/tabular-nums/.test(c.fvn) && !/mono/i.test(c.fam)).length;
      return { cellCount: cells.length, cellsWithoutTabular: noFvn, sampleBad: cells.filter((c) => !/tabular-nums/.test(c.fvn) && !/mono/i.test(c.fam)).slice(0, 5), kpis };
    });
    await ctx.close();
  }
  // 1024 tablo taşması
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  await openRoute(p, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  res.at1024 = await p.evaluate(() => {
    const de = document.documentElement;
    const t = document.querySelector('table') as HTMLElement;
    const wrap = t?.closest('[class*="overflow"]') as HTMLElement | null;
    return { docScrollW: de.scrollWidth, docClientW: de.clientWidth, tableW: t ? Math.round(t.getBoundingClientRect().width) : null, wrapClientW: wrap?.clientWidth ?? null, wrapScrollW: wrap?.scrollWidth ?? null };
  });
  await ctx.close();
  // koyu tema
  const ctxd = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const pd = await ctxd.newPage();
  await openRoute(pd, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
  await pd.screenshot({ path: 'artifacts/screens/ihracat-r10-states/kurlar-koyu-1440.png', fullPage: false, animations: 'disabled' });
  res.dark = await pd.evaluate(() => ({ html: document.documentElement.className, bodyBg: getComputedStyle(document.body).backgroundColor }));
  await ctxd.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r10c.json', JSON.stringify(res, null, 1));
  console.error(JSON.stringify(res.at1024), JSON.stringify(res.dark));
}
main().catch((e) => { console.error(e); process.exit(1); });
