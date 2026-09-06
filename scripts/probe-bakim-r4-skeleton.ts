/** Tur 4 — yükleme iskeleti yüksekliği ile gerçek contentBottom karşılaştırması (bakim-makine-detay-09, bakim-isemirleri-detay-06). */
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

const contentBottom = () => {
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  let bottom = 0;
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    bottom = Math.max(bottom, r.bottom + window.scrollY);
  }
  return Math.round(bottom);
};

const skeletonBottom = () => {
  const busy = document.querySelector<HTMLElement>('[aria-busy]');
  const el = busy ?? document.querySelector<HTMLElement>('[data-slot="skeleton"]')?.parentElement ?? null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return Math.round(r.bottom + window.scrollY);
};

async function main() {
  const routes = process.argv.slice(2).filter((a) => a.startsWith('/'));
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const account = resolveAccount('bakim');
  const out: Record<string, unknown> = {};
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await login(page, base, account, route);
    // Gerçek içerik yüksekliği: tam yüklenmiş sayfa.
    await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const real = await page.evaluate(contentBottom);

    // İskelet yüksekliği: aynı rotayı yeniden aç, ilk boyamadan hemen sonra (skeleton hâlâ görünürken) ölç.
    await page.goto(`${base}${route}`, { waitUntil: 'commit' });
    let skel: number | null = null;
    for (let i = 0; i < 20; i++) {
      skel = await page.evaluate(skeletonBottom).catch(() => null);
      if (skel !== null) break;
      await page.waitForTimeout(50);
    }
    out[route] = { realContentBottom: real, skeletonBottom: skel, diff: skel !== null ? Math.abs(real - skel) : null };
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
