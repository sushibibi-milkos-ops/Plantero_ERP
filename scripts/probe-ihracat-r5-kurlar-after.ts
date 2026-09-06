/**
 * Tur 5 düzeltme kanıtı (measureAfter) — ihracat-kurlar-09 (P2): mobil kur kartının metrik yuvası
 * artık hangi kuru gösterdiğini (Satış) etiketliyor; masaüstü tabloda tekrar etmiyor.
 */
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const mobilePage = await mobileCtx.newPage();
  await openRoute(mobilePage, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
  out.mobileFirstCard = await mobilePage.evaluate(() => {
    const card = document.querySelector('li.rounded-lg.border.border-border\\/70');
    if (!card) return { err: 'kart yok' };
    const labelEl = [...card.querySelectorAll('span')].find((s) => (s.textContent || '').trim() === 'Satış');
    return {
      text: (card.textContent || '').replace(/\s+/g, ' ').trim(),
      labelVisible: labelEl ? getComputedStyle(labelEl).display !== 'none' : false,
    };
  });
  await mobilePage.screenshot({ path: resolve(process.cwd(), 'artifacts', 'critic', 'ihracat-r5-kurlar-mobile-after-390.png'), animations: 'disabled' });

  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const deskPage = await deskCtx.newPage();
  await openRoute(deskPage, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
  out.desktopFirstRowSellingCell = await deskPage.evaluate(() => {
    const row = document.querySelector('table tbody tr');
    if (!row) return { err: 'satır yok' };
    const cells = [...row.querySelectorAll('td')];
    const selling = cells[3]; // Tarih, Para birimi, Alış, Satış, Kaynak
    const labelEl = selling ? [...selling.querySelectorAll('span')].find((s) => (s.textContent || '').trim() === 'Satış') : null;
    return { text: (selling?.textContent || '').trim(), labelVisible: labelEl ? getComputedStyle(labelEl).display !== 'none' : null };
  });

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
