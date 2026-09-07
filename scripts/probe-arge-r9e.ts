/**
 * Tur 9e — arge: :focus-visible gerçekten eşleşiyor mu + board kartı hover (border/shadow).
 * Çıktı: artifacts/critic/probe-arge-r9e.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();
const PID = process.env.PID ?? 'c2913daa-05c6-46bc-9f48-942e864a651f';

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  const page = await ctx.newPage();

  // 1) Reçete çalışma alanı — Tab ile "Onaya gönder"e ulaş
  await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((e) => (e.textContent ?? '').includes('Kaydet'));
    b?.setAttribute('data-p', 'kaydet');
    const s = Array.from(document.querySelectorAll('button')).find((e) => (e.textContent ?? '').includes('Onaya gönder'));
    s?.setAttribute('data-p', 'onaya');
  });
  await page.locator('[data-p="kaydet"]').press('Tab');
  out.onaya_focus = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return null;
    const cs = getComputedStyle(a);
    return {
      text: (a.textContent ?? '').trim().slice(0, 20),
      matchesFocusVisible: a.matches(':focus-visible'),
      outline: `${cs.outlineWidth} ${cs.outlineStyle}`,
      boxShadow: cs.boxShadow,
      borderColor: cs.borderColor,
    };
  });

  // 2) Board kartı — Tab ile odak + hover
  await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button')).find((e) =>
      (e.textContent ?? '').includes('Pazar araştırması'),
    );
    el?.setAttribute('data-p', 'card');
    const prev = el?.parentElement?.previousElementSibling;
    void prev;
  });
  out.card_rest = await page.evaluate(() => {
    const e = document.querySelector('[data-p="card"]') as HTMLElement;
    const cs = getComputedStyle(e);
    return { bg: cs.backgroundColor, border: cs.borderColor, shadow: cs.boxShadow };
  });
  await page.locator('[data-p="card"]').hover();
  await page.waitForTimeout(300);
  out.card_hover = await page.evaluate(() => {
    const e = document.querySelector('[data-p="card"]') as HTMLElement;
    const cs = getComputedStyle(e);
    return { hovered: e.matches(':hover'), bg: cs.backgroundColor, border: cs.borderColor, shadow: cs.boxShadow };
  });
  await page.locator('[data-p="card"]').press('Tab');
  await page.locator('[data-p="card"]').press('Shift+Tab');
  out.card_focus = await page.evaluate(() => {
    const e = document.querySelector('[data-p="card"]') as HTMLElement;
    const cs = getComputedStyle(e);
    return {
      isActive: document.activeElement === e,
      matchesFocusVisible: e.matches(':focus-visible'),
      outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      outlineOffset: cs.outlineOffset,
      boxShadow: cs.boxShadow,
    };
  });

  writeFileSync('artifacts/critic/probe-arge-r9e.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
