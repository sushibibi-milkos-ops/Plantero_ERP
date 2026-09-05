/** className tabanlı --primary rol taraması (critic'in orijinal yöntemine daha yakın: inherited
 *  computed color değil, elemanın KENDİ sınıfında 'primary' token'ı var mı). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/satin-alma/onay-kuyrugu', as: 'satin_alma' });
  const roles = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('main *'));
    return els
      .filter((e) => /(^|[\s"'`])(?:text|bg|border|ring|from|to|via)-primary(\/|\s|$)/.test(e.className?.toString?.() ?? ''))
      .map((e) => `${e.tagName}.${(e.className?.toString?.() ?? '').slice(0, 70)}`);
  });
  console.log(JSON.stringify(roles, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
