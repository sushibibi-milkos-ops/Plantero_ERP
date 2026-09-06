/** Tur 4 doğrulama — boş formla gönderim: aria-invalid, hata metni, odak. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const p = await ctx.newPage();
  await openRoute(p, { base: BASE, route: '/ihracat/sevkiyatlar/yeni', as: 'admin' });
  await p.getByRole('button', { name: 'Sevkiyat oluştur' }).click();
  await p.waitForTimeout(400);
  const result = await p.evaluate(() => {
    const trigger = document.getElementById('shipment-sales-order-trigger');
    return {
      ariaInvalid: trigger?.getAttribute('aria-invalid'),
      activeElId: document.activeElement?.id,
      isActiveTrigger: document.activeElement === trigger,
      errorText: document.body.textContent?.includes('İhracat siparişi seçilmedi'),
      placeholderStillSame: document.body.textContent?.includes('Sipariş seçin'),
    };
  });
  await p.screenshot({ path: resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-sevkiyatlar-yeni', 'desktop-submit-empty.png'), fullPage: true, animations: 'disabled' });
  await ctx.close();
  await browser.close();
  writeFileSync(resolve(process.cwd(), 'artifacts', 'critic', 'probe-ihracat-r4f.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
