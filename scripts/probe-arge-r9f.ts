/**
 * Tur 9f — odak halkası kontrol testi: aynı yöntemle birden çok ekranda Button odak halkası.
 * Çıktı: artifacts/critic/probe-arge-r9f.json
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();
const PID = process.env.PID ?? 'c2913daa-05c6-46bc-9f48-942e864a651f';

type Probe = { route: string; text: string };

const PROBES: Probe[] = [
  { route: '/arge/projeler', text: 'Yeni proje' },
  { route: `/arge/projeler/${PID}/receteler`, text: 'Onaya gönder' },
  { route: `/arge/projeler/${PID}/receteler`, text: 'Kaydet' },
  { route: `/arge/projeler/${PID}/board`, text: 'Kart ekle' },
  { route: '/kokpit', text: '' },
];

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

  for (const p of PROBES) {
    await openRoute(page, { base, route: p.route, as: 'admin' });
    const ok = await page.evaluate((t) => {
      document.querySelectorAll('[data-p]').forEach((e) => e.removeAttribute('data-p'));
      const btns = Array.from(document.querySelectorAll('button, a[data-slot="button"]')) as HTMLElement[];
      const el = t ? btns.find((e) => (e.textContent ?? '').includes(t)) : btns[0];
      if (!el) return false;
      el.setAttribute('data-p', 'target');
      return true;
    }, p.text);
    if (!ok) {
      out[`${p.route} :: ${p.text}`] = { found: false };
      continue;
    }
    // gerçek klavye: hedefe odaklan, Shift+Tab sonra Tab → focus-visible garanti
    await page.locator('[data-p="target"]').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    out[`${p.route} :: ${p.text}`] = await page.evaluate(() => {
      const e = document.querySelector('[data-p="target"]') as HTMLElement;
      const cs = getComputedStyle(e);
      return {
        isActive: document.activeElement === e,
        focusVisible: e.matches(':focus-visible'),
        text: (e.textContent ?? '').trim().slice(0, 20),
        cls: e.className.toString().slice(0, 60),
        outline: `${cs.outlineWidth} ${cs.outlineStyle}`,
        boxShadow: cs.boxShadow,
        borderColor: cs.borderColor,
      };
    });
  }

  writeFileSync('artifacts/critic/probe-arge-r9f.json', JSON.stringify(out, null, 1));
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
