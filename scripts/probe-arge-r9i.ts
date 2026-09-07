/**
 * Tur 9i — arge-receteler-03 doğrulama: /arge/receteler tablosunda hedef üstü birim maliyet
 * hücrelerinin rengi /arge/projeler ile birebir aynı mı (warning tonu)?
 * Çıktı: artifacts/critic/probe-arge-r9i.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};

  await openRoute(page, { base, route: '/arge/receteler', as: 'admin' });
  out['/arge/receteler'] = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    return rows.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const nameCell = cells[0]?.textContent?.trim().slice(0, 24) ?? '';
      const costCell = cells.find((c) => /₺/.test(c.textContent ?? ''));
      if (!costCell) return { name: nameCell, cost: null };
      const span = costCell.querySelector('span') ?? costCell;
      const cs = getComputedStyle(span as Element);
      return { name: nameCell, cost: costCell.textContent?.trim(), color: cs.color };
    });
  });

  await openRoute(page, { base, route: '/arge/projeler', as: 'admin' });
  out['/arge/projeler'] = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    return rows.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const nameCell = cells[0]?.textContent?.trim().slice(0, 24) ?? '';
      const costCell = cells.find((c) => /₺/.test(c.textContent ?? ''));
      if (!costCell) return { name: nameCell, cost: null };
      const span = costCell.querySelector('span') ?? costCell;
      const cs = getComputedStyle(span as Element);
      return { name: nameCell, cost: costCell.textContent?.trim(), color: cs.color };
    });
  });

  writeFileSync('artifacts/critic/probe-arge-r9i.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
