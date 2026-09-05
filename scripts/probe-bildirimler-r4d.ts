import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/onaylar', as: 'admin' });
  const state = () => page.evaluate(`(() => { const sel = document.querySelector('[role="option"][aria-selected="true"]'); const act = document.activeElement; return { selected: sel ? (sel.textContent||'').slice(0,24) : null, active: act ? (act.getAttribute('role')||act.tagName) + ':' + (act.textContent||'').slice(0,24) : null }; })()`);
  const seq: unknown[] = [];
  seq.push({ step: 'ilk', ...(await state() as object) });
  await page.locator('[role="option"]').nth(2).click();
  await page.waitForTimeout(150);
  seq.push({ step: 'satir2-tikla', ...(await state() as object) });
  for (const k of ['j', 'j', 'k']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(200);
    seq.push({ step: k, ...(await state() as object) });
  }
  console.log(JSON.stringify(seq, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
