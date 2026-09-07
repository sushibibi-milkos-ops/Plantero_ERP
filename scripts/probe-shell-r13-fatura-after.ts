/**
 * Tur 13 shell: /ihracat/sevkiyatlar/[id] "Fatura & kur" sekmesindeki fatura bağlantısının
 * ihracat-detay-23 / (shell mandatı) düzeltme sonrası ölçümü — aynı prob mantığı probe-ihracat-r13d.ts
 * ile birebir, düzeltme sonrası "after" kanıtı için ayrı dosyaya yazılır (kaynak prob değiştirilmedi).
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();

async function main() {
  const browser = await launchBrowser();
  const CLOSED = id('EXP-2026-000001');
  const res: any = {};
  for (const [vp, w, h, mobile] of [['1440', 1440, 900, false], ['390', 390, 844, true]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route: `/ihracat/sevkiyatlar/${CLOSED}`, as: 'admin' });
    await page.getByRole('tab', { name: 'Fatura & kur' }).first().click();
    await page.waitForTimeout(700);
    res[vp] = await page.evaluate(() => {
      const out: any[] = [];
      document.querySelectorAll('main a[href*="/muhasebe/faturalar/"], main a[href*="/depo/sevkiyat/"]').forEach((el) => {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        const inner = el.querySelector('span');
        out.push({ href: el.getAttribute('href')?.slice(0, 40), txt: (el.textContent ?? '').trim().slice(0, 30), w: +r.width.toFixed(1), h: +r.height.toFixed(1), color: cs.color, deco: cs.textDecorationLine, innerColor: inner ? getComputedStyle(inner).color : null, innerDeco: inner ? getComputedStyle(inner).textDecorationLine : null });
      });
      const body = getComputedStyle(document.body).color;
      return { links: out, bodyColor: body };
    });
    await page.screenshot({ path: `artifacts/critic/shell-r13-fatura-after-${vp}.png`, fullPage: true, animations: 'disabled' });
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-shell-r13-fatura-after.json', JSON.stringify(res, null, 1));
  console.error(JSON.stringify(res, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
