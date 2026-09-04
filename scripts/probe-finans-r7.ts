/**
 * Tur 7 kritik probu (yalnızca ÖLÇÜM, hiçbir şeyi değiştirmez):
 *  - hover: bir tablo satırının üzerine gelindiğinde satırdaki TÜM hücrelerin hesaplanmış
 *    arka plan rengi (sticky sütunlar satır vurgusunu yutuyor mu? kriter 5/8)
 *  - blocks: boş/uyarı bloklarının yüksekliği (kriter 3/11)
 *  - tooltip: sayfa açılışında (fare hareketi olmadan) görünür recharts tooltip var mı
 * Kullanım: pnpm tsx scripts/probe-finans-r7.ts <route> [--viewport 1440x900]
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const route = process.argv[2] ?? '/finans/krediler';
  const vpArg = process.argv.includes('--viewport') ? process.argv[process.argv.indexOf('--viewport') + 1]! : '1440x900';
  const [w, h] = vpArg.split('x').map(Number) as [number, number];
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin' });

  const preTooltip = await page.evaluate(() =>
    [...document.querySelectorAll('.recharts-tooltip-wrapper')].map((el) => {
      const r = el.getBoundingClientRect();
      return { visible: getComputedStyle(el).visibility, w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent ?? '').trim().slice(0, 60) };
    }),
  );

  const blocks = await page.evaluate(() => {
    const out: Array<{ kind: string; h: number; w: number; text: string }> = [];
    for (const el of [...document.querySelectorAll('div,section')] as HTMLElement[]) {
      const t = (el.textContent ?? '').trim();
      if (!/çizilemeyecek|henüz yok|hesaplanamadığı|kayıt yok|bulunamadı/i.test(t)) continue;
      if (el.children.length > 6) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 10) continue;
      out.push({ kind: el.className.slice(0, 80), h: Math.round(r.height), w: Math.round(r.width), text: t.slice(0, 80) });
    }
    return out;
  });

  // hover probu: her tablodaki 3. satır
  const hover: unknown[] = [];
  const tableCount = await page.locator('table').count();
  for (let ti = 0; ti < Math.min(tableCount, 3); ti++) {
    const row = page.locator('table').nth(ti).locator('tbody tr').nth(2);
    if ((await row.count()) === 0) continue;
    const before = await row.evaluate((tr) =>
      [...tr.querySelectorAll('td')].map((td) => ({
        sticky: (td as HTMLElement).classList.contains('sticky'),
        bg: getComputedStyle(td as HTMLElement).backgroundColor,
      })),
    );
    await row.hover({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.waitForTimeout(250);
    const after = await row.evaluate((tr) => ({
      rowBg: getComputedStyle(tr as HTMLElement).backgroundColor,
      cells: [...tr.querySelectorAll('td')].map((td) => ({
        sticky: (td as HTMLElement).classList.contains('sticky'),
        text: (td.textContent ?? '').trim().slice(0, 18),
        bg: getComputedStyle(td as HTMLElement).backgroundColor,
      })),
    }));
    hover.push({ table: ti, before, after });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(150);
  }

  console.log(JSON.stringify({ route, viewport: vpArg, preTooltip, blocks, hover }, null, 1));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
