/** Tur 14: tabular-nums yayılımı, mobil dokunma hedefleri (gerçekten etkileşimli), KPI hizası. */
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
    ['detay', `/ihracat/sevkiyatlar/${SHIP}`],
  ];
  for (const [k, route] of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    res[k] = await p.evaluate(() => {
      const num = /^[\s₺€$%+\-.,0-9/]+$/;
      const cells = Array.from(document.querySelectorAll('main td, main [data-slot="kpi-value"], main dd'));
      let total = 0, tabular = 0; const bad: string[] = [];
      for (const c of cells) {
        const t = (c.textContent ?? '').trim();
        if (!t || !num.test(t) || !/[0-9]/.test(t)) continue;
        total++;
        const fv = getComputedStyle(c).fontVariantNumeric;
        const inner = c.querySelector('*') ? getComputedStyle(c.querySelector('*')!).fontVariantNumeric : '';
        if (/tabular-nums/.test(fv) || /tabular-nums/.test(inner)) tabular++; else bad.push(t.slice(0, 18));
      }
      // KPI değerleri
      const kpi = Array.from(document.querySelectorAll('main [class*="tabular"]')).length;
      return { total, tabular, bad: bad.slice(0, 8), kpiTabularEls: kpi };
    });
    await ctx.close();
  }
  // mobil dokunma hedefleri: yalnızca gerçekten tıklanabilir öğeler
  const ctxm = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const pm = await ctxm.newPage();
  const mob: any = {};
  for (const [k, route] of routes) {
    await openRoute(pm, { base: BASE, route, as: 'admin' });
    mob[k] = await pm.evaluate(() => {
      const out: any[] = [];
      document.querySelectorAll('main a[href], main button, main [role="tab"], main input, main select, main [role="combobox"]').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
        const r = el.getBoundingClientRect();
        if (r.width <= 2 && r.height <= 2) return; // gizli native select
        if (r.width === 0 || r.height === 0) return;
        if (r.height < 44) out.push({ t: el.tagName, txt: (el.textContent ?? '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) });
      });
      return out;
    });
  }
  res.mobileTouch = mob;
  await ctxm.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r14d.json', JSON.stringify(res, null, 1));
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
