/** Tur 4 doğrulama — /bakim/is-emirleri/[id] "Makine bilgisi" grubunda Güç/kW dizesinin ham
 * numeric(18,4) değil QtyCell çıktısı olduğunu doğrular (bakim-isemirleri-detay-10/11). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const collect = () => {
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  const html = main.innerHTML;
  return {
    hasKW: html.includes('kW'),
    hasMakineBilgisi: html.includes('Makine bilgisi'),
    idxMakine: html.indexOf('Makine bilgisi'),
    snippetAfterMakine: html.indexOf('Makine bilgisi') >= 0 ? html.slice(html.indexOf('Makine bilgisi'), html.indexOf('Makine bilgisi')+1500) : null,
  };
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
