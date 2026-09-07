/** Tur 9: boş durum + kanban görünümü kanıtı (/bakim/is-emirleri). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  await page.getByPlaceholder(/İş emri no/).fill('zzzzqq');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/critic/bakim-r9-bos-1440.png' });
  const empty = await page.evaluate(() => {
    const t = document.body.innerText;
    const svgs = Array.from(document.querySelectorAll('main svg')).length;
    return { text: t.slice(t.indexOf('kayıt') > -1 ? 0 : 0).match(/(Sonuç|bulunam|eşleş|kayıt yok|temizle)[^\n]*/gi), svgs };
  });
  await page.getByPlaceholder(/İş emri no/).fill('');
  await page.waitForTimeout(300);
  const kanban = await page.evaluate(() => Array.from(document.querySelectorAll('button[aria-label],button')).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean).slice(0, 20));
  await browser.close();
  process.stdout.write(JSON.stringify({ empty, kanban }, null, 2) + '\n');
})();
