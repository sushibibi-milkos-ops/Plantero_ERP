/**
 * Tur 10 kokpit prob-G: "Günlük kanal satışları" bölümünün İKİ para satırının anatomisi
 * (Brüt özet satırı ↔ tek-kanal satırı) — aynı sütun, aynı değer, farklı kademe mi?
 *   tsx scripts/probe-kokpit-r10g.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r10');

const SRC = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const secs = Array.from(main.querySelectorAll('section'));
  const out = [];
  secs.forEach((s) => {
    const title = (s.querySelector('h2')?.textContent || '').trim();
    // sağa hizalı para/sayı düğümleri
    const nums = Array.from(s.querySelectorAll('.num, [class*="tabular"]')).filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && /[0-9]/.test(el.textContent || '');
    }).map((el) => {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const row = el.closest('a,li,div');
      const rb = row ? row.getBoundingClientRect() : b;
      return { t: (el.textContent || '').trim().slice(0, 22), fs: cs.fontSize, fw: cs.fontWeight, right: r1(b.right), rowH: r1(rb.height) };
    });
    if (nums.length) out.push({ title, nums });
  });
  return out;
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  mkdirSync(OUT, { recursive: true });
  const out: Record<string, unknown> = {};
  try {
    for (const as of ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi']) {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
        locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light',
      });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: '/kokpit', as });
      out[as] = await page.evaluate(SRC);
      await ctx.close();
      console.error(`✓ ${as}`);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'probe-r10g.json'), JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
