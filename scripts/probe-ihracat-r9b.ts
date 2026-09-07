/** Tur 9: satır hover geri bildirimi + medya sorgusu doğrulaması. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: '/ihracat/belgeler', as: 'admin' });

  const mq = await page.evaluate(() => ({
    hoverHover: matchMedia('(hover: hover)').matches,
    pointerFine: matchMedia('(pointer: fine)').matches,
  }));

  const rowClasses = await page.evaluate(() => {
    const tr = document.querySelector('table tbody tr') as HTMLElement;
    return { cls: tr.className, tdCls: (tr.children[0] as HTMLElement).className };
  });

  const box = await page.locator('table tbody tr').first().boundingBox();
  const before = await page.evaluate(() => {
    const tr = document.querySelector('table tbody tr') as HTMLElement;
    return { tr: getComputedStyle(tr).backgroundColor, td: getComputedStyle(tr.children[0] as HTMLElement).backgroundColor };
  });
  await page.mouse.move((box!.x + box!.width / 2), (box!.y + box!.height / 2));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const tr = document.querySelector('table tbody tr') as HTMLElement;
    return { tr: getComputedStyle(tr).backgroundColor, td: getComputedStyle(tr.children[0] as HTMLElement).backgroundColor, hovered: tr.matches(':hover') };
  });

  // aynı ölçüm başka bir modülde (referans davranış)
  await openRoute(page, { base: BASE, route: '/ihracat/kurlar', as: 'admin' });
  const box2 = await page.locator('table tbody tr').first().boundingBox();
  const kBefore = await page.evaluate(() => getComputedStyle(document.querySelector('table tbody tr') as HTMLElement).backgroundColor);
  await page.mouse.move(box2!.x + 200, box2!.y + box2!.height / 2);
  await page.waitForTimeout(300);
  const kAfter = await page.evaluate(() => {
    const tr = document.querySelector('table tbody tr') as HTMLElement;
    return { bg: getComputedStyle(tr).backgroundColor, hovered: tr.matches(':hover'), cls: tr.className };
  });

  process.stdout.write(JSON.stringify({ mq, rowClasses, before, after, kurlar: { kBefore, kAfter } }, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
