/** Tur 23 (shell) — shell-button-active-state-01 kapanış kanıtı: gerçek fare basışıyla (mouse.down,
 *  :focus-visible TETİKLENMEZ) Button ve kokpit RowLink/KpiCard/Section-Tümü üzerinde `:active`
 *  transform/arka plan gerçekten uygulanıyor mu, ve `active:` sınıf işaretçisi kaynakta var mı? */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();

async function pressAndRead(p: import('@playwright/test').Page, locator: import('@playwright/test').Locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  const snap = (el: Element) => `${getComputedStyle(el).transform}|${getComputedStyle(el).scale}|${getComputedStyle(el).backgroundColor}|${getComputedStyle(el).color}`;
  const before = await locator.evaluate(snap);
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(180); // transition süresi (140-150ms) dolsun
  const during = await locator.evaluate(snap);
  await p.mouse.up();
  return { before, during, changed: before !== during };
}

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const p = await ctx.newPage();

  const out: Record<string, unknown> = {};

  // Button (native <button>) — DataTable "Yeni" birincil aksiyon
  await openRoute(p, { base: BASE, route: '/ana-veri/urunler', as: 'admin' });
  await p.screenshot({ path: '/tmp/debug-urunler.png' });
  out['button-yeni'] = await pressAndRead(p, p.getByRole('link', { name: 'Yeni ürün' }));

  await openRoute(p, { base: BASE, route: '/kokpit', as: 'genel_mudur' });
  // RowLink (Section "Tümü" listesi altındaki bir satır) — üretim hatları satırı
  const rowLink = p.locator('a[href="/uretim/hatlar"]').last();
  out['rowlink'] = await pressAndRead(p, rowLink);
  // Section "Tümü" bağlantısı
  out['section-tumu'] = await pressAndRead(p, p.getByRole('link', { name: 'Tümü' }).first());
  // KpiCard (strip)
  out['kpicard'] = await pressAndRead(p, p.locator('a[data-pressable]').first());

  writeFileSync('/home/user/Plantero_ERP/artifacts/critic/probe-shell-r23-active.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
