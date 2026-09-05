import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/onaylar', as: 'admin' });
  await page.keyboard.press('Tab'); // klavye modalitesini aç
  await page.locator('[role="option"][tabindex="0"]').first().evaluate((e: HTMLElement) => e.focus());
  const a = await page.evaluate(`(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { role: e.getAttribute('role'), focusVisible: e.matches(':focus-visible'), outline: cs.outlineWidth+' '+cs.outlineStyle, boxShadow: cs.boxShadow }; })()`);
  // j ile bir sonraki satıra geç (klavye gezinme) ve ölç
  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  const b = await page.evaluate(`(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { role: e.getAttribute('role'), text:(e.textContent||'').slice(0,26), focusVisible: e.matches(':focus-visible'), outline: cs.outlineWidth+' '+cs.outlineStyle, boxShadow: cs.boxShadow }; })()`);
  console.log(JSON.stringify({ programmaticAfterTab: a, afterJ: b }, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
