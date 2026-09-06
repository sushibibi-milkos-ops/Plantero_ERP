/** Tur 4 doğrulama — /bakim/makineler/[id] "Genel" grubundaki Güç değerinin QtyCell çıktısıyla
 * /bakim/is-emirleri/[id]'deki (probe-bakim-r4-qty.ts) aynı makine için birebir eşleştiğini
 * doğrular (bakim-isemirleri-detay-11: iki kardeş ekran aynı alanı aynı biçimde göstermeli). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const collect = () => {
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  const html = main.innerHTML;
  const idx = html.indexOf('Güç');
  return { snippet: idx >= 0 ? html.slice(idx, idx + 300) : 'NOT FOUND' };
};
async function main() {
  const route = process.argv[2]!;
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { route, as: 'admin', base });
  console.log(JSON.stringify(await page.evaluate(collect), null, 1));
  await ctx.close(); await browser.close();
}
main();
