/**
 * Tur 9d — arge: gerçek klavye ile odak halkası + satır hover doğrulaması.
 * Çıktı: artifacts/critic/probe-arge-r9d.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();
const PID = process.env.PID ?? 'c2913daa-05c6-46bc-9f48-942e864a651f';

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  const open = async (route: string, w = 1440, h = 900) => {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
    });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'admin' });
    return { page, ctx };
  };

  // Reçete çalışma alanı: "Onaya gönder" butonuna klavyeyle ulaş, odak halkasını ölç
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/receteler`);
    const found = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((e) =>
        (e.textContent ?? '').includes('Onaya gönder'),
      ) as HTMLElement | undefined;
      if (!b) return false;
      b.setAttribute('data-probe', '1');
      return true;
    });
    if (found) {
      // gerçek klavye odağı: önceki elemana odaklan, sonra Tab
      await page.evaluate(() => {
        const b = document.querySelector('[data-probe="1"]') as HTMLElement;
        const prev = b.previousElementSibling as HTMLElement | null;
        prev?.focus();
      });
      await page.keyboard.press('Tab');
      out.focus_onaya = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return null;
        const cs = getComputedStyle(a);
        return {
          text: (a.textContent ?? '').trim().slice(0, 24),
          isTarget: a.getAttribute('data-probe') === '1',
          outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
          boxShadow: cs.boxShadow.slice(0, 90),
        };
      });
    }
    await ctx.close();
  }

  // Board: kartın klavye odağı
  {
    const { page, ctx } = await open(`/arge/projeler/${PID}/board`);
    out.board_card_focus = await (async () => {
      const el = page.locator('text=Pazar araştırması').first();
      const handle = await el.elementHandle();
      if (!handle) return null;
      // kartın kendisi (tıklanabilir ata) bul
      const info = await page.evaluate((node) => {
        let e = node as HTMLElement | null;
        while (e && !(e.tabIndex >= 0 || e.tagName === 'BUTTON' || e.tagName === 'A')) e = e.parentElement;
        if (!e) return null;
        e.setAttribute('data-probe2', '1');
        return { tag: e.tagName, cls: e.className.toString().slice(0, 120), tabindex: e.tabIndex };
      }, handle);
      if (!info) return null;
      await page.locator('[data-probe2="1"]').focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return null;
        const cs = getComputedStyle(a);
        return {
          isTarget: a.getAttribute('data-probe2') === '1',
          outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
          boxShadow: cs.boxShadow.slice(0, 90),
        };
      });
      return { info, focus };
    })();

    // hover: karta fare götür, arka planı ölç
    out.board_card_hover = await (async () => {
      const before = await page.evaluate(() => {
        const e = document.querySelector('[data-probe2="1"]') as HTMLElement | null;
        return e ? getComputedStyle(e).backgroundColor + ' | shadow=' + getComputedStyle(e).boxShadow.slice(0, 40) : null;
      });
      await page.locator('[data-probe2="1"]').hover();
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => {
        const e = document.querySelector('[data-probe2="1"]') as HTMLElement | null;
        return e ? getComputedStyle(e).backgroundColor + ' | shadow=' + getComputedStyle(e).boxShadow.slice(0, 40) : null;
      });
      return { before, after };
    })();
    await ctx.close();
  }

  writeFileSync('artifacts/critic/probe-arge-r9d.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
