/** Tur 4 ek prob: klavye odak halkası + kirletilmemiş hover ölçümü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // /onaylar — hover (odak vermeden), sonra klavye ile satıra Tab
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/onaylar', as: 'admin' });
    const row = page.locator('[role="option"]').nth(3);
    const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    await row.hover();
    await page.waitForTimeout(250);
    const after = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    // klavye odağı: sayfa başından Tab'la seçili satıra ulaş (tabIndex=0 yalnızca seçili satırda)
    await page.keyboard.press('Tab');
    for (let i = 0; i < 25; i++) {
      const isRow = await page.evaluate(`(() => !!document.activeElement && document.activeElement.getAttribute('role') === 'option')()`);
      if (isRow) break;
      await page.keyboard.press('Tab');
    }
    out.onaylar = {
      hover: { before, after, changes: before !== after },
      keyboardFocus: await page.evaluate(`(() => { const e = document.activeElement; if (!e) return null; const cs = getComputedStyle(e); return { role: e.getAttribute('role'), tag: e.tagName, outline: cs.outlineWidth + ' ' + cs.outlineStyle, boxShadow: cs.boxShadow, focusVisible: e.matches(':focus-visible') }; })()`),
    };
    await ctx.close();
  }

  // /bildirimler — klavye ile ilk bildirim bağlantısına Tab
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bildirimler', as: 'depo' });
    await page.keyboard.press('Tab');
    let found = false;
    for (let i = 0; i < 40; i++) {
      found = (await page.evaluate(`(() => { const e = document.activeElement; return !!e && !!e.closest('main ul > li'); })()`)) as boolean;
      if (found) break;
      await page.keyboard.press('Tab');
    }
    out.bildirimler = {
      found,
      keyboardFocus: await page.evaluate(`(() => { const e = document.activeElement; if (!e) return null; const cs = getComputedStyle(e); return { tag: e.tagName, text: (e.textContent||'').slice(0,30), outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineOffset, boxShadow: cs.boxShadow, focusVisible: e.matches(':focus-visible') }; })()`),
    };
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
