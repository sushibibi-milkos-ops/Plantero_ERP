/** Tur 5: boş durum + iskelet + mobil kur kartı metrik etiketi ölçümü. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const dir = resolve(process.cwd(), 'artifacts', 'critic');

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  mkdirSync(dir, { recursive: true });

  // Boş sonuç durumu (masaüstü)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  await page.getByPlaceholder(/Sevkiyat no/).fill('zzzz');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(dir, 'ihracat-r5-bos-sonuc-1440.png'), animations: 'disabled' });
  out.emptyFiltered = await page.evaluate(() => {
    const t = document.body.innerText;
    return { hasEmptyText: /bulunamadı|sonuç|kayıt yok|Sevkiyat yok/i.test(t), snippet: t.split('\n').filter((l) => l.trim()).slice(-8) };
  });

  // Mobil kur kartı: metrik yuvasında etiket var mı
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const mp = await m.newPage();
  await openRoute(mp, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
  out.rateCard = await mp.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find((e) => /₺/.test(e.textContent || '')) || null;
    if (!li) return { err: 'kart yok' };
    return { text: (li.textContent || '').trim(), h: Math.round(li.getBoundingClientRect().height), html: li.innerHTML.slice(0, 400) };
  });

  // Sevkiyat mobil kart ayraç genişlikleri (shell bulgusu doğrulaması)
  await openRoute(mp, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  out.sepWidths = await mp.evaluate(() => {
    const res: Array<{ t: string; w: number }> = [];
    for (const li of [...document.querySelectorAll('ul li')]) {
      for (const el of [...li.querySelectorAll('span,div')]) {
        if (el.children.length === 0 && /^\s*·\s*$/.test(el.textContent || '')) {
          const r = el.getBoundingClientRect();
          res.push({ t: JSON.stringify(el.textContent), w: Math.round(r.width * 10) / 10 });
        }
      }
    }
    return res;
  });

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
